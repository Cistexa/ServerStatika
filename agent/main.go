package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

type Config struct {
	ServerURL   string        `json:"server_url"`
	ServerToken string        `json:"server_token"`
	ServerName  string        `json:"server_name"`
	IntervalSec time.Duration `json:"interval_sec"`
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

type MetricData struct {
	CPUUsagePercent float64       `json:"cpu_usage_percent"`
	RAM             RAMInfo       `json:"ram"`
	Disk            DiskInfo      `json:"disk"`
	TopProcesses    []ProcessInfo `json:"top_processes"`
}

type MetricsUploadRequest struct {
	ServerToken string     `json:"server_token"`
	Metrics     MetricData `json:"metrics"`
}

type RegisterRequest struct {
	Token     string `json:"token"`
	Name      string `json:"name"`
	IPAddress string `json:"ip_address"`
	OS        string `json:"os"`
}

func main() {
	log.Println("[+] ServerStatika Agent is starting...")

	config := loadConfig()

	// Gather agent host info
	osName := runtime.GOOS
	hostInfo, err := host.Info()
	if err == nil {
		osName = fmt.Sprintf("%s %s (%s)", hostInfo.OS, hostInfo.PlatformVersion, hostInfo.KernelVersion)
	}

	ipAddress := getOutboundIP()

	log.Printf("[+] OS detected: %s\n", osName)
	log.Printf("[+] Outbound IP detected: %s\n", ipAddress)

	// Perform Handshake & Registration
	register(config, ipAddress, osName)

	// Metrics collection loop
	ticker := time.NewTicker(config.IntervalSec * time.Second)
	defer ticker.Stop()

	log.Printf("[+] Entering metric collection loop (Interval: %ds)...\n", config.IntervalSec)
	for range ticker.C {
		metrics, err := collectMetrics()
		if err != nil {
			log.Printf("[-] Metric collection failed: %v\n", err)
			continue
		}

		sendMetrics(config, metrics)
	}
}

func loadConfig() Config {
	defaultConfig := Config{
		ServerURL:   "http://localhost:8080",
		ServerToken: "srv_local_development",
		ServerName:  "Local Machine",
		IntervalSec: 5,
	}

	exePath, err := os.Executable()
	if err != nil {
		return defaultConfig
	}

	configPath := filepath.Join(filepath.Dir(exePath), "config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Try current working directory
		configPath = "config.json"
	}

	file, err := os.Open(configPath)
	if err != nil {
		log.Println("[!] config.json not found, using default configurations")
		return defaultConfig
	}
	defer file.Close()

	var config Config
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		log.Println("[!] Failed to parse config.json, using defaults")
		return defaultConfig
	}

	if config.IntervalSec <= 0 {
		config.IntervalSec = 5
	}
	return config
}

func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func getDiskPath() string {
	if runtime.GOOS == "windows" {
		drive := os.Getenv("SystemDrive")
		if drive == "" {
			return "C:"
		}
		return drive
	}
	return "/"
}

func register(cfg Config, ip, osName string) {
	url := fmt.Sprintf("%s/api/agent/register", cfg.ServerURL)
	payload := RegisterRequest{
		Token:     cfg.ServerToken,
		Name:      cfg.ServerName,
		IPAddress: ip,
		OS:        osName,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("[-] Failed to marshal registration payload: %v\n", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Printf("[!] Handshake failed: %v. Will retry sending metrics anyway.\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Println("[+] Handshake successful. Server registered.")
	} else {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[!] Handshake returned status %s: %s\n", resp.Status, string(body))
	}
}

func collectMetrics() (MetricData, error) {
	var metrics MetricData

	// 1. CPU Usage (sample for 500ms to get accurate reading)
	cpuPercents, err := cpu.Percent(500*time.Millisecond, false)
	if err != nil {
		return metrics, fmt.Errorf("failed to get CPU usage: %w", err)
	}
	if len(cpuPercents) > 0 {
		metrics.CPUUsagePercent = cpuPercents[0]
	}

	// 2. RAM Usage
	vMem, err := mem.VirtualMemory()
	if err != nil {
		return metrics, fmt.Errorf("failed to get RAM usage: %w", err)
	}
	metrics.RAM = RAMInfo{
		TotalMB: vMem.Total / 1024 / 1024,
		UsedMB:  vMem.Used / 1024 / 1024,
		Percent: vMem.UsedPercent,
	}

	// 3. Disk Usage
	diskPath := getDiskPath()
	dUsage, err := disk.Usage(diskPath)
	if err != nil {
		return metrics, fmt.Errorf("failed to get disk usage on %s: %w", diskPath, err)
	}
	metrics.Disk = DiskInfo{
		Path:    diskPath,
		TotalGB: dUsage.Total / 1024 / 1024 / 1024,
		UsedGB:  dUsage.Used / 1024 / 1024 / 1024,
		Percent: dUsage.UsedPercent,
	}

	// 4. Process list
	metrics.TopProcesses = getTopProcesses(vMem.Total)

	return metrics, nil
}

func getTopProcesses(totalRAM uint64) []ProcessInfo {
	procs, err := process.Processes()
	if err != nil {
		return nil
	}

	var procInfos []ProcessInfo
	for _, p := range procs {
		if p.Pid == 0 {
			continue // Skip idle system loop process
		}

		name, err := p.Name()
		if err != nil {
			continue
		}

		// Retrieve memory details
		memInfo, err := p.MemoryInfo()
		if err != nil {
			continue
		}
		ramPercent := (float64(memInfo.RSS) / float64(totalRAM)) * 100.0

		// CPU Percent calculation (non-blocking)
		cpuPercent, err := p.Percent(0)
		if err != nil {
			continue
		}

		procInfos = append(procInfos, ProcessInfo{
			PID:  p.Pid,
			Name: name,
			CPU:  cpuPercent,
			RAM:  ramPercent,
		})
	}

	// Sort processes by CPU descending, fallback to Memory
	sort.Slice(procInfos, func(i, j int) bool {
		if procInfos[i].CPU == procInfos[j].CPU {
			return procInfos[i].RAM > procInfos[j].RAM
		}
		return procInfos[i].CPU > procInfos[j].CPU
	})

	// Return top 5
	if len(procInfos) > 5 {
		return procInfos[:5]
	}
	return procInfos
}

func sendMetrics(cfg Config, m MetricData) {
	url := fmt.Sprintf("%s/api/agent/metrics", cfg.ServerURL)
	payload := MetricsUploadRequest{
		ServerToken: cfg.ServerToken,
		Metrics:     m,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[-] Failed to marshal metrics: %v\n", err)
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Printf("[-] Failed to send metrics to backend: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[-] Server returned error status %s: %s\n", resp.Status, string(body))
	} else {
		log.Printf("[+] Metrics sent: CPU: %.1f%%, RAM: %.1f%%, Disk: %.1f%%\n",
			m.CPUUsagePercent, m.RAM.Percent, m.Disk.Percent)
	}
}
