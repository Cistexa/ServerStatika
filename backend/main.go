package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

//go:embed dist
var frontendFS embed.FS

func main() {
	// Initialize database
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "statika.db"
	}

	log.Printf("[+] Initializing database at %s...\n", dbPath)
	if err := InitDB(dbPath); err != nil {
		log.Fatalf("[-] Database initialization failed: %v\n", err)
	}

	// Start background checker for offline servers
	go func() {
		log.Println("[+] Starting background status checker...")
		for {
			time.Sleep(5 * time.Second)
			_, err := CheckOfflineServers(15.0) // 15 seconds threshold
			if err != nil {
				log.Printf("[-] Error checking offline servers: %v\n", err)
			}
		}
	}()

	// Register API endpoints using Go 1.22+ routing rules
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/agent/register", handleRegister)
	mux.HandleFunc("POST /api/agent/metrics", handlePostMetrics)
	mux.HandleFunc("GET /api/servers", handleGetServers)
	mux.HandleFunc("GET /api/servers/{id}/metrics", handleGetServerMetrics)
	mux.HandleFunc("GET /api/alerts", handleGetAlerts)

	// Serve React Frontend SPA
	mux.Handle("/", serveSPA(frontendFS))

	// CORS wrapper
	handler := enableCORS(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("[+] ServerStatika backend is listening on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("[-] Failed to start server: %v\n", err)
	}
}

// serveSPA serves built static React files from embedded folder.
func serveSPA(embeddedFS embed.FS) http.Handler {
	subFS, err := fs.Sub(embeddedFS, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("Dashboard distribution is not bundled yet."))
		})
	}

	fileServer := http.FileServer(http.FS(subFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Try to open the file in the sub-filesystem
		f, err := subFS.Open(path)
		if err != nil {
			// If file doesn't exist, serve index.html for client-side SPA routing
			indexFile, err := subFS.Open("index.html")
			if err != nil {
				http.Error(w, "index.html not found", http.StatusNotFound)
				return
			}
			defer indexFile.Close()

			stat, err := indexFile.Stat()
			if err != nil {
				http.Error(w, "failed to read index.html info", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeContent(w, r, "index.html", stat.ModTime(), indexFile.(io.ReadSeeker))
			return
		}
		f.Close()

		fileServer.ServeHTTP(w, r)
	})
}
