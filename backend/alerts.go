package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

const (
	defaultCPUThreshold  = 90.0 // percent
	defaultRAMThreshold  = 90.0 // percent
	defaultDiskThreshold = 90.0 // percent
)

// checkThresholdAlerts evaluates CPU, RAM, and Disk metrics against thresholds.
func checkThresholdAlerts(serverID string, m MetricData, now time.Time) {
	// Retrieve server name for notifications
	var serverName string
	err := db.QueryRow("SELECT name FROM servers WHERE id = ?", serverID).Scan(&serverName)
	if err != nil {
		serverName = serverID // Fallback to ID
	}

	// 1. Check CPU
	evaluateMetric(serverID, serverName, "cpu", m.CPUUsagePercent, defaultCPUThreshold, now)

	// 2. Check RAM
	evaluateMetric(serverID, serverName, "ram", m.RAM.Percent, defaultRAMThreshold, now)

	// 3. Check Disk
	evaluateMetric(serverID, serverName, "disk", m.Disk.Percent, defaultDiskThreshold, now)
}

// evaluateMetric checks a single metric against its threshold. If crossed, it triggers an alert.
func evaluateMetric(serverID, serverName, metricType string, value, threshold float64, now time.Time) {
	var alertID int64
	var activeValue float64

	// Check if there is an active alert for this metric on this server
	err := db.QueryRow(`
		SELECT id, value 
		FROM alerts 
		WHERE server_id = ? AND metric_type = ? AND resolved_at IS NULL
	`, serverID, metricType).Scan(&alertID, &activeValue)

	hasActiveAlert := err != sql.ErrNoRows && err == nil

	if value >= threshold {
		if !hasActiveAlert {
			// Trigger a new alert
			res, err := db.Exec(`
				INSERT INTO alerts (server_id, metric_type, value, threshold, triggered_at)
				VALUES (?, ?, ?, ?, ?)
			`, serverID, metricType, value, threshold, now)

			if err != nil {
				log.Printf("[-] Failed to insert alert: %v\n", err)
				return
			}

			id, _ := res.LastInsertId()
			msg := fmt.Sprintf("⚠️ [ALERT] Server **%s** (%s) threshold exceeded! Current %s usage is **%.1f%%** (Threshold: %.1f%%)",
				serverName, serverID, metricType, value, threshold)
			log.Println(msg)
			sendNotification(msg)

			_ = id
		}
	} else {
		if hasActiveAlert {
			// Resolve the existing alert
			_, err := db.Exec(`
				UPDATE alerts 
				SET resolved_at = ? 
				WHERE id = ?
			`, now, alertID)

			if err != nil {
				log.Printf("[-] Failed to resolve alert %d: %v\n", alertID, err)
				return
			}

			msg := fmt.Sprintf("✅ [RESOLVED] Server **%s** (%s) %s usage has returned to normal: **%.1f%%** (Threshold: %.1f%%)",
				serverName, serverID, metricType, value, threshold)
			log.Println(msg)
			sendNotification(msg)
		}
	}
}

// NotifyOffline triggers an alert when a server is detected offline.
func NotifyOffline(serverName, serverID string) {
	msg := fmt.Sprintf("🚨 [OFFLINE] Server **%s** (%s) has not reported metrics for more than 15 seconds!", serverName, serverID)
	log.Println(msg)
	sendNotification(msg)
}

// sendNotification routes alerts to configured channels (Discord webhook, etc.).
func sendNotification(message string) {
	webhookURL := os.Getenv("DISCORD_WEBHOOK_URL")
	if webhookURL == "" {
		return
	}

	payload := map[string]string{
		"content": message,
	}
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[-] Failed to marshal Discord payload: %v\n", err)
		return
	}

	go func() {
		resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonPayload))
		if err != nil {
			log.Printf("[-] Failed to send Discord alert: %v\n", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("[-] Discord Webhook returned status: %s\n", resp.Status)
		}
	}()
}
