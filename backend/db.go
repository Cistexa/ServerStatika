package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

type Server struct {
	ID        string    `json:"id"` // token
	Name      string    `json:"name"`
	IPAddress string    `json:"ip_address"`
	OS        string    `json:"os"`
	LastSeen  time.Time `json:"last_seen"`
	CreatedAt time.Time `json:"created_at"`
	Status    string    `json:"status"` // "online", "offline"
}

type RAMInfo struct {
	TotalMB uint64  `json:"total_mb"`
	UsedMB  uint64  `json:"used_mb"`
	Percent float64 `json:"percent"`
}

type DiskInfo struct {
	Path    string  `json:"path"`
	TotalGB uint64  `json:"total_gb"`
	UsedGB  uint64  `json:"used_gb"`
	Percent float64 `json:"percent"`
}

type ProcessInfo struct {
	PID  int32   `json:"pid"`
	Name string  `json:"name"`
	CPU  float64 `json:"cpu"`
	RAM  float64 `json:"ram"`
}

type DockerContainer struct {
	ID      string `json:"id"`
	Names   string `json:"names"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Status  string `json:"status"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // "info", "warn", "error"
	Source    string `json:"source"`
	Message   string `json:"message"`
}

type MetricData struct {
	CPUUsagePercent  float64            `json:"cpu_usage_percent"`
	RAM              RAMInfo            `json:"ram"`
	Disk             DiskInfo           `json:"disk"`
	TopProcesses     []ProcessInfo      `json:"top_processes"`
	NetSentBytesSec  float64            `json:"net_sent_bytes_sec"`
	NetRecvBytesSec  float64            `json:"net_recv_bytes_sec"`
	DiskReadBytesSec float64            `json:"disk_read_bytes_sec"`
	DiskWriteBytesSec float64           `json:"disk_write_bytes_sec"`
	Services         map[string]string  `json:"services"` // e.g. {"Nginx": "active", "Postgres": "inactive"}
	DockerContainers []DockerContainer  `json:"docker_containers"`
	Logs             []LogEntry         `json:"logs"`
}

type MetricRecord struct {
	ID        int64      `json:"id"`
	ServerID  string     `json:"server_id"`
	Timestamp time.Time  `json:"timestamp"`
	Metrics   MetricData `json:"metrics"`
}

type Alert struct {
	ID          int64      `json:"id"`
	ServerID    string     `json:"server_id"`
	ServerName  string     `json:"server_name"`
	MetricType  string     `json:"metric_type"` // "cpu", "ram", "disk", "status"
	Value       float64    `json:"value"`
	Threshold   float64    `json:"threshold"`
	TriggeredAt time.Time  `json:"triggered_at"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`
}

// InitDB initializes the SQLite database and creates the tables if they don't exist.
func InitDB(dbPath string) error {
	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Create tables
	queries := []string{
		`CREATE TABLE IF NOT EXISTS servers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			ip_address TEXT NOT NULL,
			os TEXT NOT NULL,
			last_seen DATETIME NOT NULL,
			created_at DATETIME NOT NULL,
			status TEXT DEFAULT 'online'
		);`,
		`CREATE TABLE IF NOT EXISTS metrics (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id TEXT NOT NULL,
			timestamp DATETIME NOT NULL,
			cpu_usage REAL NOT NULL,
			ram_total INTEGER NOT NULL,
			ram_used INTEGER NOT NULL,
			ram_percent REAL NOT NULL,
			disk_total INTEGER NOT NULL,
			disk_used INTEGER NOT NULL,
			disk_percent REAL NOT NULL,
			top_processes TEXT,
			net_sent_bytes_sec REAL DEFAULT 0,
			net_recv_bytes_sec REAL DEFAULT 0,
			disk_read_bytes_sec REAL DEFAULT 0,
			disk_write_bytes_sec REAL DEFAULT 0,
			services TEXT,
			docker_containers TEXT,
			logs TEXT,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS alerts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id TEXT NOT NULL,
			metric_type TEXT NOT NULL,
			value REAL NOT NULL,
			threshold REAL NOT NULL,
			triggered_at DATETIME NOT NULL,
			resolved_at DATETIME,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		);`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return fmt.Errorf("failed to execute query %q: %w", query, err)
		}
	}

	return nil
}

// RegisterServer inserts or updates a server registration.
func RegisterServer(id, name, ip, os string) (*Server, error) {
	now := time.Now()
	_, err := db.Exec(`
		INSERT INTO servers (id, name, ip_address, os, last_seen, created_at, status)
		VALUES (?, ?, ?, ?, ?, ?, 'online')
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			ip_address = excluded.ip_address,
			os = excluded.os,
			last_seen = excluded.last_seen,
			status = 'online'
	`, id, name, ip, os, now, now)

	if err != nil {
		return nil, fmt.Errorf("failed to upsert server: %w", err)
	}

	return &Server{
		ID:        id,
		Name:      name,
		IPAddress: ip,
		OS:        os,
		LastSeen:  now,
		CreatedAt: now,
		Status:    "online",
	}, nil
}

// SaveMetrics saves agent metrics and triggers threshold alerting checks.
func SaveMetrics(serverID string, m MetricData) error {
	now := time.Now()

	// 1. Verify server exists and update last_seen/status
	var exists bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM servers WHERE id = ?)", serverID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("error checking server existence: %w", err)
	}
	if !exists {
		return fmt.Errorf("server with token %s is not registered", serverID)
	}

	_, err = db.Exec("UPDATE servers SET last_seen = ?, status = 'online' WHERE id = ?", now, serverID)
	if err != nil {
		return fmt.Errorf("failed to update server last_seen: %w", err)
	}

	// Serialize processes to JSON string
	procJSON, _ := json.Marshal(m.TopProcesses)
	if len(m.TopProcesses) == 0 {
		procJSON = []byte("[]")
	}

	// Serialize services map
	servicesJSON, _ := json.Marshal(m.Services)
	if m.Services == nil {
		servicesJSON = []byte("{}")
	}

	// Serialize docker containers
	containersJSON, _ := json.Marshal(m.DockerContainers)
	if len(m.DockerContainers) == 0 {
		containersJSON = []byte("[]")
	}

	// Serialize logs
	logsJSON, _ := json.Marshal(m.Logs)
	if len(m.Logs) == 0 {
		logsJSON = []byte("[]")
	}

	// 2. Insert metric record
	_, err = db.Exec(`
		INSERT INTO metrics (
			server_id, timestamp, cpu_usage, 
			ram_total, ram_used, ram_percent, 
			disk_total, disk_used, disk_percent, 
			top_processes, net_sent_bytes_sec, net_recv_bytes_sec,
			disk_read_bytes_sec, disk_write_bytes_sec, services,
			docker_containers, logs
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, serverID, now, m.CPUUsagePercent,
		m.RAM.TotalMB, m.RAM.UsedMB, m.RAM.Percent,
		m.Disk.TotalGB, m.Disk.UsedGB, m.Disk.Percent,
		string(procJSON), m.NetSentBytesSec, m.NetRecvBytesSec,
		m.DiskReadBytesSec, m.DiskWriteBytesSec, string(servicesJSON),
		string(containersJSON), string(logsJSON))

	if err != nil {
		return fmt.Errorf("failed to save metrics: %w", err)
	}

	// 3. Trigger alert check
	checkThresholdAlerts(serverID, m, now)

	return nil
}

// GetServers retrieves all registered servers and their details.
func GetServers() ([]Server, error) {
	rows, err := db.Query("SELECT id, name, ip_address, os, last_seen, created_at, status FROM servers ORDER BY name ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch servers: %w", err)
	}
	defer rows.Close()

	var list []Server
	for rows.Next() {
		var s Server
		var lastSeenStr, createdAtStr string
		if err := rows.Scan(&s.ID, &s.Name, &s.IPAddress, &s.OS, &lastSeenStr, &createdAtStr, &s.Status); err != nil {
			return nil, fmt.Errorf("failed to scan server: %w", err)
		}
		s.LastSeen, _ = time.Parse(time.RFC3339, lastSeenStr)
		if s.LastSeen.IsZero() {
			s.LastSeen, _ = time.Parse("2006-01-02 15:04:05-07:00", lastSeenStr)
		}
		if s.LastSeen.IsZero() {
			s.LastSeen, _ = time.Parse("2006-01-02 15:04:05", lastSeenStr)
		}
		s.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		if s.CreatedAt.IsZero() {
			s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05-07:00", createdAtStr)
		}
		if s.CreatedAt.IsZero() {
			s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
		}
		list = append(list, s)
	}
	return list, nil
}

// GetServerMetrics fetches historical metrics for a specific server.
func GetServerMetrics(serverID string, limit int) ([]MetricRecord, error) {
	rows, err := db.Query(`
		SELECT id, timestamp, cpu_usage, 
		       ram_total, ram_used, ram_percent, 
		       disk_total, disk_used, disk_percent, 
		       top_processes, net_sent_bytes_sec, net_recv_bytes_sec,
		       disk_read_bytes_sec, disk_write_bytes_sec, services,
		       docker_containers, logs
		FROM metrics 
		WHERE server_id = ? 
		ORDER BY timestamp DESC 
		LIMIT ?
	`, serverID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metrics: %w", err)
	}
	defer rows.Close()

	var list []MetricRecord
	for rows.Next() {
		var mr MetricRecord
		mr.ServerID = serverID
		var tsStr string
		var topProcStr, servicesStr, containersStr, logsStr string
		if err := rows.Scan(
			&mr.ID, &tsStr, &mr.Metrics.CPUUsagePercent,
			&mr.Metrics.RAM.TotalMB, &mr.Metrics.RAM.UsedMB, &mr.Metrics.RAM.Percent,
			&mr.Metrics.Disk.TotalGB, &mr.Metrics.Disk.UsedGB, &mr.Metrics.Disk.Percent,
			&topProcStr, &mr.Metrics.NetSentBytesSec, &mr.Metrics.NetRecvBytesSec,
			&mr.Metrics.DiskReadBytesSec, &mr.Metrics.DiskWriteBytesSec, &servicesStr,
			&containersStr, &logsStr,
		); err != nil {
			return nil, fmt.Errorf("failed to scan metrics: %w", err)
		}
		mr.Timestamp, _ = time.Parse(time.RFC3339, tsStr)
		if mr.Timestamp.IsZero() {
			mr.Timestamp, _ = time.Parse("2006-01-02 15:04:05-07:00", tsStr)
		}
		if mr.Timestamp.IsZero() {
			mr.Timestamp, _ = time.Parse("2006-01-02 15:04:05", tsStr)
		}

		// Deserializations
		var procs []ProcessInfo
		if err := json.Unmarshal([]byte(topProcStr), &procs); err == nil {
			mr.Metrics.TopProcesses = procs
		} else {
			mr.Metrics.TopProcesses = []ProcessInfo{}
		}

		var svcs map[string]string
		if err := json.Unmarshal([]byte(servicesStr), &svcs); err == nil {
			mr.Metrics.Services = svcs
		} else {
			mr.Metrics.Services = make(map[string]string)
		}

		var conts []DockerContainer
		if err := json.Unmarshal([]byte(containersStr), &conts); err == nil {
			mr.Metrics.DockerContainers = conts
		} else {
			mr.Metrics.DockerContainers = []DockerContainer{}
		}

		var logs []LogEntry
		if err := json.Unmarshal([]byte(logsStr), &logs); err == nil {
			mr.Metrics.Logs = logs
		} else {
			mr.Metrics.Logs = []LogEntry{}
		}

		list = append(list, mr)
	}

	// Reverse list to chronological order (for charts)
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}

	return list, nil
}

// GetAlerts fetches triggered alerts.
func GetAlerts(limit int) ([]Alert, error) {
	rows, err := db.Query(`
		SELECT a.id, a.server_id, s.name, a.metric_type, a.value, a.threshold, a.triggered_at, a.resolved_at
		FROM alerts a
		JOIN servers s ON a.server_id = s.id
		ORDER BY a.triggered_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch alerts: %w", err)
	}
	defer rows.Close()

	var list []Alert
	for rows.Next() {
		var a Alert
		var trigStr string
		var resStr sql.NullString
		if err := rows.Scan(&a.ID, &a.ServerID, &a.ServerName, &a.MetricType, &a.Value, &a.Threshold, &trigStr, &resStr); err != nil {
			return nil, fmt.Errorf("failed to scan alert: %w", err)
		}
		a.TriggeredAt, _ = time.Parse(time.RFC3339, trigStr)
		if a.TriggeredAt.IsZero() {
			a.TriggeredAt, _ = time.Parse("2006-01-02 15:04:05-07:00", trigStr)
		}
		if a.TriggeredAt.IsZero() {
			a.TriggeredAt, _ = time.Parse("2006-01-02 15:04:05", trigStr)
		}

		if resStr.Valid {
			t, err := time.Parse(time.RFC3339, resStr.String)
			if err != nil {
				t, err = time.Parse("2006-01-02 15:04:05-07:00", resStr.String)
			}
			if err != nil {
				t, _ = time.Parse("2006-01-02 15:04:05", resStr.String)
			}
			a.ResolvedAt = &t
		}
		list = append(list, a)
	}
	return list, nil
}

// CheckOfflineServers scans all servers and marks those as offline which haven't reported in 15 seconds.
func CheckOfflineServers(thresholdSec float64) ([]string, error) {
	now := time.Now()
	rows, err := db.Query("SELECT id, name, last_seen, status FROM servers WHERE status = 'online'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var offlineAlerts []string
	for rows.Next() {
		var id, name, lastSeenStr, status string
		if err := rows.Scan(&id, &name, &lastSeenStr, &status); err != nil {
			continue
		}
		lastSeen, err := time.Parse(time.RFC3339, lastSeenStr)
		if err != nil {
			lastSeen, err = time.Parse("2006-01-02 15:04:05-07:00", lastSeenStr)
		}
		if err != nil {
			lastSeen, _ = time.Parse("2006-01-02 15:04:05", lastSeenStr)
		}

		if now.Sub(lastSeen).Seconds() > thresholdSec {
			// Mark offline
			_, err = db.Exec("UPDATE servers SET status = 'offline' WHERE id = ?", id)
			if err == nil {
				offlineAlerts = append(offlineAlerts, name)
				// Create offline alert in DB
				db.Exec(`
					INSERT INTO alerts (server_id, metric_type, value, threshold, triggered_at)
					VALUES (?, 'status', 0, 0, ?)
				`, id, now)

				// Trigger notification
				NotifyOffline(name, id)
			}
		}
	}
	return offlineAlerts, nil
}
