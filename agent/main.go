package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	gopsdisk "github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	gopsnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type Config struct {
	ServerURL   string        `json:"server_url"`
	ServerToken string        `json:"server_token"`
	ServerName  string        `json:"server_name"`
	IntervalSec time.Duration `json:"interval_sec"`
	Services    []string      `json:"services"`  // e.g. ["Nginx:80", "Postgres:5432"]
	LogFiles    []string      `json:"log_files"` // e.g. ["c:/Users/cinar/Documents/GitHub/ServerStatika/backend/app.log"]
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
	ID     string `json:"id"`
	Names  string `json:"names"`
	Image  string `json:"image"`
	State  string `json:"state"`
	Status string `json:"status"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // "info", "warn", "error"
	Source    string `json:"source"`
	Message   string `json:"message"`
}

type MetricData struct {
	CPUUsagePercent   float64            `json:"cpu_usage_percent"`
	RAM               RAMInfo            `json:"ram"`
	Disk              DiskInfo           `json:"disk"`
	TopProcesses      []ProcessInfo      `json:"top_processes"`
	NetSentBytesSec   float64            `json:"net_sent_bytes_sec"`
	NetRecvBytesSec   float64            `json:"net_recv_bytes_sec"`
	DiskReadBytesSec  float64            `json:"disk_read_bytes_sec"`
	DiskWriteBytesSec float64            `json:"disk_write_bytes_sec"`
	Services          map[string]string  `json:"services"`
	DockerContainers  []DockerContainer  `json:"docker_containers"`
	Logs              []LogEntry         `json:"logs"`
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

type AgentCommand struct {
	ID          string `json:"id"`
	ServerID    string `json:"server_id"`
	CommandType string `json:"command_type"`
	Payload     string `json:"payload"`
}

// Caching stats for differential speed tracking
var (
	prevNetSent   uint64
	prevNetRecv   uint64
	prevDiskRead  uint64
	prevDiskWrite uint64
	lastCheckTime time.Time
	logOffsets    = make(map[string]int64)
)

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

	// Setup initial cache values for IO speed tracking
	initIOCaches()

	// Metrics collection loop
	ticker := time.NewTicker(config.IntervalSec * time.Second)
	defer ticker.Stop()

	log.Printf("[+] Entering metric collection loop (Interval: %ds)...\n", config.IntervalSec)
	for range ticker.C {
		metrics, err := collectMetrics(config)
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
		ServerToken: "srv_dev_local_test",
		ServerName:  "Development Local Server",
		IntervalSec: 5,
		Services:    []string{"ServerStatika:8080"},
		LogFiles:    []string{},
	}

	exePath, err := os.Executable()
	if err != nil {
		return defaultConfig
	}

	configPath := filepath.Join(filepath.Dir(exePath), "config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
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

// initIOCaches warms up previous values for network and disk I/O
func initIOCaches() {
	lastCheckTime = time.Now()

	// Warmup Net
	netStats, err := gopsnet.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		prevNetSent = netStats[0].BytesSent
		prevNetRecv = netStats[0].BytesRecv
	}

	// Warmup Disk
	diskStats, err := gopsdisk.IOCounters()
	if err == nil {
		var totalRead, totalWrite uint64
		for _, stat := range diskStats {
			totalRead += stat.ReadBytes
			totalWrite += stat.WriteBytes
		}
		prevDiskRead = totalRead
		prevDiskWrite = totalWrite
	}
}

func collectMetrics(cfg Config) (MetricData, error) {
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
	dUsage, err := gopsdisk.Usage(diskPath)
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

	// 5. Calculate Network and Disk I/O speeds
	calculateIOSpeeds(&metrics)

	// 6. Check Service Statuses
	metrics.Services = checkServices(cfg.Services)

	// 7. Check Docker containers
	metrics.DockerContainers = getDockerContainers()

	// 8. Gather new logs
	metrics.Logs = readNewLogs(cfg.LogFiles)

	return metrics, nil
}

func calculateIOSpeeds(m *MetricData) {
	now := time.Now()
	elapsed := now.Sub(lastCheckTime).Seconds()
	if elapsed <= 0 {
		elapsed = 1.0
	}
	lastCheckTime = now

	// Network
	netStats, err := gopsnet.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		currSent := netStats[0].BytesSent
		currRecv := netStats[0].BytesRecv

		if prevNetSent > 0 && currSent >= prevNetSent {
			m.NetSentBytesSec = float64(currSent-prevNetSent) / elapsed
		}
		if prevNetRecv > 0 && currRecv >= prevNetRecv {
			m.NetRecvBytesSec = float64(currRecv-prevNetRecv) / elapsed
		}

		prevNetSent = currSent
		prevNetRecv = currRecv
	}

	// Disk I/O
	diskStats, err := gopsdisk.IOCounters()
	if err == nil {
		var currRead, currWrite uint64
		for _, stat := range diskStats {
			currRead += stat.ReadBytes
			currWrite += stat.WriteBytes
		}

		if prevDiskRead > 0 && currRead >= prevDiskRead {
			m.DiskReadBytesSec = float64(currRead-prevDiskRead) / elapsed
		}
		if prevDiskWrite > 0 && currWrite >= prevDiskWrite {
			m.DiskWriteBytesSec = float64(currWrite-prevDiskWrite) / elapsed
		}

		prevDiskRead = currRead
		prevDiskWrite = currWrite
	}
}

func checkServices(services []string) map[string]string {
	statuses := make(map[string]string)
	for _, s := range services {
		parts := strings.Split(s, ":")
		if len(parts) < 2 {
			continue
		}
		name := parts[0]
		port := parts[1]

		// Try TCP connection with 500ms timeout
		address := net.JoinHostPort("127.0.0.1", port)
		conn, err := net.DialTimeout("tcp", address, 500*time.Millisecond)
		if err != nil {
			statuses[name] = "inactive"
		} else {
			statuses[name] = "active"
			conn.Close()
		}
	}
	return statuses
}

type DockerPSOutput struct {
	ID     string `json:"ID"`
	Names  string `json:"Names"`
	Image  string `json:"Image"`
	State  string `json:"State"`
	Status string `json:"Status"`
}

func getDockerContainers() []DockerContainer {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "ps", "--format", "{{json .}}")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	err := cmd.Run()
	if err != nil {
		return []DockerContainer{} // Return empty if docker fails or is missing
	}

	var list []DockerContainer
	lines := strings.Split(stdout.String(), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var raw DockerPSOutput
		if err := json.Unmarshal([]byte(line), &raw); err == nil {
			list = append(list, DockerContainer{
				ID:     raw.ID,
				Names:  raw.Names,
				Image:  raw.Image,
				State:  raw.State,
				Status: raw.Status,
			})
		}
	}
	return list
}

func readNewLogs(files []string) []LogEntry {
	var entries []LogEntry
	for _, fPath := range files {
		file, err := os.Open(fPath)
		if err != nil {
			continue // Skip if can't open
		}

		stat, err := file.Stat()
		if err != nil {
			file.Close()
			continue
		}

		prevOffset := logOffsets[fPath]
		currentSize := stat.Size()

		// If file was truncated or rotated
		if currentSize < prevOffset {
			prevOffset = 0
		}

		if currentSize > prevOffset {
			_, err = file.Seek(prevOffset, io.SeekStart)
			if err == nil {
				reader := bufio.NewReader(file)
				for {
					line, err := reader.ReadString('\n')
					if err != nil {
						break
					}
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}

					level := "info"
					lowerLine := strings.ToLower(line)
					if strings.Contains(lowerLine, "error") || strings.Contains(lowerLine, "fail") || strings.Contains(lowerLine, "fatal") {
						level = "error"
					} else if strings.Contains(lowerLine, "warn") || strings.Contains(lowerLine, "warning") {
						level = "warn"
					}

					entries = append(entries, LogEntry{
						Timestamp: time.Now().Format(time.RFC3339),
						Level:     level,
						Source:    filepath.Base(fPath),
						Message:   line,
					})
				}
				logOffsets[fPath] = currentSize
			}
		}
		file.Close()
	}
	return entries
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
		log.Printf("[+] Metrics sent: CPU: %.1f%%, RAM: %.1f%%, Disk: %.1f%%, Net: %.1f/%.1f KB/s\n",
			m.CPUUsagePercent, m.RAM.Percent, m.Disk.Percent, m.NetSentBytesSec/1024, m.NetRecvBytesSec/1024)

		var responseData struct {
			Commands []AgentCommand `json:"commands"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&responseData); err == nil {
			if len(responseData.Commands) > 0 {
				log.Printf("[+] Received %d pending commands from backend. Executing...\n", len(responseData.Commands))
				for _, cmd := range responseData.Commands {
					go executeAgentCommand(cfg, cmd)
				}
			}
		}
	}
}

func executeAgentCommand(cfg Config, cmd AgentCommand) {
	log.Printf("[+] Executing command %s (Type: %s, Payload: %s)\n", cmd.ID, cmd.CommandType, cmd.Payload)

	var output string
	var success bool = false

	switch cmd.CommandType {
	case "docker":
		type DockerPayload struct {
			ContainerID string `json:"container_id"`
			Action      string `json:"action"` // "start", "stop", "restart"
		}
		var dp DockerPayload
		if err := json.Unmarshal([]byte(cmd.Payload), &dp); err == nil {
			if dp.Action == "start" || dp.Action == "stop" || dp.Action == "restart" {
				log.Printf("[+] Running: docker %s %s\n", dp.Action, dp.ContainerID)
				c := exec.Command("docker", dp.Action, dp.ContainerID)
				out, err := c.CombinedOutput()
				if err != nil {
					output = fmt.Sprintf("Error running docker command: %v\nOutput: %s", err, string(out))
				} else {
					output = string(out)
					success = true
				}
			} else {
				output = fmt.Sprintf("Invalid Docker action: %s", dp.Action)
			}
		} else {
			output = fmt.Sprintf("Invalid Docker command payload: %s", cmd.Payload)
		}

	case "process":
		type ProcessPayload struct {
			PID int32 `json:"pid"`
		}
		var pp ProcessPayload
		if err := json.Unmarshal([]byte(cmd.Payload), &pp); err == nil {
			log.Printf("[+] Killing process: %d\n", pp.PID)
			var killCmd *exec.Cmd
			if runtime.GOOS == "windows" {
				killCmd = exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", pp.PID))
			} else {
				killCmd = exec.Command("kill", "-9", fmt.Sprintf("%d", pp.PID))
			}
			out, err := killCmd.CombinedOutput()
			if err != nil {
				output = fmt.Sprintf("Error killing process %d: %v\nOutput: %s", pp.PID, err, string(out))
			} else {
				output = fmt.Sprintf("Successfully killed process %d\nOutput: %s", pp.PID, string(out))
				success = true
			}
		} else {
			output = fmt.Sprintf("Invalid Process kill payload: %s", cmd.Payload)
		}

	case "diagnostics":
		type DiagnosticsPayload struct {
			Command string `json:"command"`
		}
		var dp DiagnosticsPayload
		if err := json.Unmarshal([]byte(cmd.Payload), &dp); err == nil {
			var dCmd *exec.Cmd
			switch dp.Command {
			case "ping":
				if runtime.GOOS == "windows" {
					dCmd = exec.Command("ping", "-n", "4", "8.8.8.8")
				} else {
					dCmd = exec.Command("ping", "-c", "4", "8.8.8.8")
				}
			case "netstat":
				if runtime.GOOS == "windows" {
					dCmd = exec.Command("netstat", "-ano")
				} else {
					dCmd = exec.Command("netstat", "-plntu")
				}
			case "diskspace":
				if runtime.GOOS == "windows" {
					dCmd = exec.Command("wmic", "logicaldisk", "get", "caption,size,freespace")
				} else {
					dCmd = exec.Command("df", "-h")
				}
			default:
				output = fmt.Sprintf("Unknown diagnostics command: %s", dp.Command)
			}

			if dCmd != nil {
				log.Printf("[+] Running diagnostic: %v\n", dCmd.Args)
				out, err := dCmd.CombinedOutput()
				if err != nil {
					if dp.Command == "netstat" && runtime.GOOS != "windows" {
						dCmdFallback := exec.Command("ss", "-tulpn")
						outF, errF := dCmdFallback.CombinedOutput()
						if errF == nil {
							output = string(outF)
							success = true
						} else {
							output = fmt.Sprintf("Diagnostics command failed: %v\nOutput: %s\nFallback ss failed: %v\nOutput: %s", err, string(out), errF, string(outF))
						}
					} else {
						output = fmt.Sprintf("Diagnostics command failed: %v\nOutput: %s", err, string(out))
					}
				} else {
					output = string(out)
					success = true
				}
			}
		} else {
			output = fmt.Sprintf("Invalid Diagnostics command payload: %s", cmd.Payload)
		}

	default:
		output = fmt.Sprintf("Unknown command type: %s", cmd.CommandType)
	}

	statusStr := "failed"
	if success {
		statusStr = "success"
	}
	sendResultToBackend(cfg, cmd.ID, statusStr, output)
}

func sendResultToBackend(cfg Config, cmdID, status, result string) {
	url := fmt.Sprintf("%s/api/agent/commands/result", cfg.ServerURL)
	payload := map[string]string{
		"command_id": cmdID,
		"status":     status,
		"result":     result,
	}

	jsonPayload, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Printf("[-] Failed to send command %s result to backend: %v\n", cmdID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[-] Backend returned error for command result %s: %s\n", cmdID, string(body))
	} else {
		log.Printf("[+] Command %s result sent to backend: %s\n", cmdID, status)
	}
}
