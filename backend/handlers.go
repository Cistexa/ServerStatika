package main

import (
	"encoding/json"
	"net/http"
	"strconv"
)

type RegisterRequest struct {
	Token     string `json:"token"`
	Name      string `json:"name"`
	IPAddress string `json:"ip_address"`
	OS        string `json:"os"`
}

type MetricsUploadRequest struct {
	ServerToken string     `json:"server_token"`
	Metrics     MetricData `json:"metrics"`
}

// JSONResponse is a helper to write JSON responses.
func JSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// JSONError writes an error message in JSON format.
func JSONError(w http.ResponseWriter, status int, message string) {
	JSONResponse(w, status, map[string]string{"error": message})
}

// handleRegister handles the agent's registration request (Handshake).
func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		JSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.Token == "" || req.Name == "" {
		JSONError(w, http.StatusBadRequest, "Token and Name are required")
		return
	}

	server, err := RegisterServer(req.Token, req.Name, req.IPAddress, req.OS)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	JSONResponse(w, http.StatusOK, server)
}

// handlePostMetrics handles the metrics reporting from agents.
func handlePostMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		JSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req MetricsUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.ServerToken == "" {
		JSONError(w, http.StatusBadRequest, "Server token is required")
		return
	}

	err := SaveMetrics(req.ServerToken, req.Metrics)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	JSONResponse(w, http.StatusOK, map[string]string{"status": "metrics saved"})
}

// handleGetServers retrieves all servers.
func handleGetServers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		JSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	servers, err := GetServers()
	if err != nil {
		JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if servers == nil {
		servers = []Server{}
	}

	JSONResponse(w, http.StatusOK, servers)
}

// handleGetServerMetrics retrieves metrics for a specific server.
func handleGetServerMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		JSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Go 1.22+ wildcard path values
	serverID := r.PathValue("id")
	if serverID == "" {
		JSONError(w, http.StatusBadRequest, "Server ID is required")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	metrics, err := GetServerMetrics(serverID, limit)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if metrics == nil {
		metrics = []MetricRecord{}
	}

	JSONResponse(w, http.StatusOK, metrics)
}

// handleGetAlerts retrieves the alert log.
func handleGetAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		JSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	alerts, err := GetAlerts(limit)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if alerts == nil {
		alerts = []Alert{}
	}

	JSONResponse(w, http.StatusOK, alerts)
}

// enableCORS middleware provides cross-origin sharing for the local frontend developer server.
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
