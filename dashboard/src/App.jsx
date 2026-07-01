import React, { useState, useEffect, useRef } from 'react';
import { 
  Server as ServerIcon, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Settings
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import MetricGauges from './components/MetricGauges';
import ThroughputCards from './components/ThroughputCards';
import SVGChart from './components/SVGChart';
import ProcessesTable from './components/ProcessesTable';
import DockerTable from './components/DockerTable';
import ServicesWidget from './components/ServicesWidget';
import TerminalPanel from './components/TerminalPanel';

const API_BASE = window.location.port === '5173' ? 'http://localhost:8080' : '';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'alerts'
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeChartMetric, setActiveChartMetric] = useState('cpu'); // 'cpu' | 'ram' | 'disk'
  const [accumulatedLogs, setAccumulatedLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  
  // States for Remote Command Execution and Threshold Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [cpuLimit, setCpuLimit] = useState(90);
  const [ramLimit, setRamLimit] = useState(90);
  const [diskLimit, setDiskLimit] = useState(90);
  
  const [terminalActiveTab, setTerminalActiveTab] = useState('logs'); // 'logs' | 'diagnostics'
  const [commandHistory, setCommandHistory] = useState([]);
  const [runningCommandId, setRunningCommandId] = useState(null);
  const [selectedDiagnosticCmd, setSelectedDiagnosticCmd] = useState('ping');
  const [isExecutingDiagnostic, setIsExecutingDiagnostic] = useState(false);

  const terminalConsoleRef = useRef(null);

  // Fetch servers list
  const fetchServers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/servers`);
      if (res.ok) {
        const data = await res.json();
        setServers(data || []);
        if (data && data.length > 0 && !selectedServerId) {
          setSelectedServerId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch servers", err);
    }
  };

  // Fetch historical metrics for selected server
  const fetchMetrics = async (serverId) => {
    if (!serverId) return;
    try {
      const res = await fetch(`${API_BASE}/api/servers/${serverId}/metrics?limit=40`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch metrics", err);
    }
  };

  // Fetch alerts
  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchServers(), fetchAlerts()]);
      setLoading(false);
    };
    init();
  }, []);

  // Poll servers and alerts
  useEffect(() => {
    const interval = setInterval(() => {
      fetchServers();
      fetchAlerts();
      setLastRefreshed(new Date());
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedServerId]);

  // Fetch metrics periodically
  useEffect(() => {
    fetchMetrics(selectedServerId);
    const interval = setInterval(() => {
      fetchMetrics(selectedServerId);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedServerId]);

  // Accumulate logs from metrics history
  useEffect(() => {
    if (metrics && metrics.length > 0) {
      const allLogs = [];
      metrics.forEach(record => {
        if (record.metrics.logs) {
          record.metrics.logs.forEach(logLine => {
            allLogs.push(logLine);
          });
        }
      });

      // Sort chronologically
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Deduplicate
      const uniqueLogs = [];
      const seen = new Set();
      allLogs.forEach(logLine => {
        const key = `${logLine.timestamp}-${logLine.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueLogs.push(logLine);
        }
      });

      setAccumulatedLogs(uniqueLogs.slice(-150));
    } else {
      setAccumulatedLogs([]);
    }
  }, [metrics]);

  // Auto-scroll terminal console internally without jumping main viewport
  useEffect(() => {
    if (terminalConsoleRef.current) {
      terminalConsoleRef.current.scrollTop = terminalConsoleRef.current.scrollHeight;
    }
  }, [accumulatedLogs]);

  // Fetch command history periodically
  useEffect(() => {
    if (!selectedServerId) return;
    fetchCommandHistory(selectedServerId);
    const interval = setInterval(() => {
      fetchCommandHistory(selectedServerId);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedServerId]);

  // Selected server details
  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Load configured thresholds when selected server changes
  useEffect(() => {
    if (selectedServer) {
      setCpuLimit(selectedServer.cpu_threshold || 90);
      setRamLimit(selectedServer.ram_threshold || 90);
      setDiskLimit(selectedServer.disk_threshold || 90);
    }
  }, [selectedServerId, servers]);

  const fetchCommandHistory = async (serverId) => {
    if (!serverId) return;
    try {
      const res = await fetch(`${API_BASE}/api/servers/${serverId}/commands?limit=15`);
      if (res.ok) {
        const data = await res.json();
        setCommandHistory(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch commands history", err);
    }
  };

  const queueCommand = async (type, payload) => {
    if (!selectedServerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/servers/${selectedServerId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command_type: type, payload: JSON.stringify(payload) })
      });
      if (res.ok) {
        const data = await res.json();
        fetchCommandHistory(selectedServerId);
        return data.command_id;
      }
    } catch (err) {
      console.error("Failed to queue command", err);
    }
  };

  const handleDockerAction = async (containerId, action) => {
    setRunningCommandId(containerId + '-' + action);
    await queueCommand('docker', { container_id: containerId, action: action });
    setTimeout(() => {
      setRunningCommandId(null);
    }, 6000);
  };

  const handleKillProcess = async (pid, processName) => {
    if (window.confirm(`Are you sure you want to terminate process ${processName} (PID: ${pid})?`)) {
      setRunningCommandId('kill-' + pid);
      await queueCommand('process', { pid: parseInt(pid) });
      setTimeout(() => {
        setRunningCommandId(null);
      }, 6000);
    }
  };

  const handleRunDiagnostic = async () => {
    setIsExecutingDiagnostic(true);
    const cmdId = await queueCommand('diagnostics', { command: selectedDiagnosticCmd });
    
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${API_BASE}/api/servers/${selectedServerId}/commands?limit=5`);
        if (res.ok) {
          const data = await res.json();
          const targetCmd = data.find(c => c.id === cmdId);
          if (targetCmd && (targetCmd.status === 'success' || targetCmd.status === 'failed')) {
            clearInterval(pollInterval);
            setIsExecutingDiagnostic(false);
            fetchCommandHistory(selectedServerId);
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (attempts > 10) {
        clearInterval(pollInterval);
        setIsExecutingDiagnostic(false);
      }
    }, 2000);
  };

  const handleSaveThresholds = async () => {
    if (!selectedServerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/servers/${selectedServerId}/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpu_threshold: parseFloat(cpuLimit),
          ram_threshold: parseFloat(ramLimit),
          disk_threshold: parseFloat(diskLimit)
        })
      });
      if (res.ok) {
        setShowSettingsModal(false);
        fetchServers();
      }
    } catch (err) {
      console.error("Failed to update thresholds", err);
    }
  };

  const latestMetricRecord = metrics[metrics.length - 1];
  const latestMetrics = latestMetricRecord ? latestMetricRecord.metrics : null;

  // Overview stats
  const totalServers = servers.length;
  const onlineServers = servers.filter(s => s.status === 'online').length;
  const activeAlerts = alerts.filter(a => !a.resolved_at).length;

  return (
    <div className="app-container">
      {/* Sidebar Section */}
      <Sidebar 
        servers={servers}
        selectedServerId={selectedServerId}
        setSelectedServerId={setSelectedServerId}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeAlerts={activeAlerts}
      />

      {/* Main Content Dashboard */}
      <main className="main-panel">
        <header className="dashboard-header">
          <div className="header-title-section">
            <h1>
              {activeTab === 'dashboard' ? 'Server Monitoring Dashboard' : 'Central Incident & Alert Logs'}
            </h1>
            <p>
              Last checked: {lastRefreshed.toLocaleTimeString()}
            </p>
          </div>
          <button 
            onClick={async () => {
              await Promise.all([fetchServers(), fetchAlerts()]);
              if (selectedServerId) fetchMetrics(selectedServerId);
            }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '8px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px'
            }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </header>

        {/* Global Overview Grid */}
        <section className="overview-grid">
          <div className="stat-box">
            <div className="stat-icon-wrapper">
              <ServerIcon size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Hosts</span>
              <span className="stat-value">{totalServers}</span>
            </div>
          </div>

          <div className="stat-box online-servers">
            <div className="stat-icon-wrapper">
              <CheckCircle size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Online Hosts</span>
              <span className="stat-value">{onlineServers}</span>
            </div>
          </div>

          <div className="stat-box alert-count">
            <div className="stat-icon-wrapper">
              <AlertTriangle size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Active Incidents</span>
              <span className="stat-value">{activeAlerts}</span>
            </div>
          </div>
        </section>

        {loading ? (
          <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : activeTab === 'dashboard' ? (
          /* DASHBOARD VIEW */
          selectedServer ? (
            <div>
              {/* Server Profile Details */}
              <div className={`server-profile-header ${selectedServer.status}`}>
                <div className="server-info-details">
                  <div className="server-avatar">
                    <ServerIcon size={24} />
                  </div>
                  <div className="server-meta-text">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {selectedServer.name} 
                      <span className={`server-badge ${selectedServer.status}`}>
                        {selectedServer.status}
                      </span>
                      <button 
                        onClick={() => setShowSettingsModal(true)}
                        className="server-settings-trigger"
                        title="Configure Alert Thresholds"
                      >
                        <Settings size={18} />
                      </button>
                    </h2>
                    <div className="server-meta-tags">
                      <span><strong>IP:</strong> {selectedServer.ip_address}</span>
                      <span><strong>OS:</strong> {selectedServer.os}</span>
                      <span><strong>Token:</strong> {selectedServer.id}</span>
                      <span><strong>Last Seen:</strong> {new Date(selectedServer.last_seen).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {latestMetrics ? (
                <>
                  {/* Real-time Metric Dials */}
                  <MetricGauges latestMetrics={latestMetrics} />

                  {/* DevOps Network & Disk Throughput Grid */}
                  <ThroughputCards latestMetrics={latestMetrics} />

                  {/* SVG Charts & Processes Row */}
                  <div className="dashboard-details-row">
                    <SVGChart 
                      metrics={metrics}
                      activeChartMetric={activeChartMetric}
                      setActiveChartMetric={setActiveChartMetric}
                    />

                    <ProcessesTable 
                      latestMetrics={latestMetrics}
                      runningCommandId={runningCommandId}
                      handleKillProcess={handleKillProcess}
                    />
                  </div>

                  {/* DevOps Services Statuses & Docker Containers */}
                  <div className="dashboard-details-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '24px' }}>
                    <DockerTable 
                      latestMetrics={latestMetrics}
                      runningCommandId={runningCommandId}
                      handleDockerAction={handleDockerAction}
                    />

                    <ServicesWidget latestMetrics={latestMetrics} />
                  </div>

                  {/* Live Log Stream & Diagnostics Terminal Panel */}
                  <TerminalPanel 
                    terminalActiveTab={terminalActiveTab}
                    setTerminalActiveTab={setTerminalActiveTab}
                    accumulatedLogs={accumulatedLogs}
                    terminalConsoleRef={terminalConsoleRef}
                    selectedDiagnosticCmd={selectedDiagnosticCmd}
                    setSelectedDiagnosticCmd={setSelectedDiagnosticCmd}
                    isExecutingDiagnostic={isExecutingDiagnostic}
                    handleRunDiagnostic={handleRunDiagnostic}
                    commandHistory={commandHistory}
                  />

                </>
              ) : (
                <div className="empty-state" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
                  <Clock size={48} style={{ color: 'var(--text-muted)' }} />
                  <h3>Waiting for Agent Metrics...</h3>
                  <p>
                    Server registration received successfully. Waiting for the agent to start reporting telemetry data.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <ServerIcon size={48} />
              <h3>Select a host to begin monitoring</h3>
              <p>Add hosts to your infrastructure, set up agents, and details will display here.</p>
            </div>
          )
        ) : (
          /* INCIDENTS LOG VIEW */
          <div className="alerts-view-container">
            <div className="alert-timeline-card">
              <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Active & Historical Incidents</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                Track metrics violations, thresholds, and health warnings.
              </p>
              
              <div className="alert-timeline-list">
                {alerts.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={48} style={{ color: 'var(--color-online)' }} />
                    <h3>System Normal</h3>
                    <p>No system alerts or threshold violations recorded.</p>
                  </div>
                ) : (
                  alerts.map(a => (
                    <div 
                      key={a.id}
                      className={`alert-log-item ${a.resolved_at ? 'resolved' : 'active'}`}
                    >
                      <div className="alert-log-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="alert-log-details">
                        <div className="alert-log-message">
                          {a.metric_type === 'status' ? (
                            `Host "${a.server_name}" went offline`
                          ) : (
                            `Host "${a.server_name}" exceeded ${a.metric_type} limit: ${a.value.toFixed(1)}% (Threshold: ${a.threshold}%)`
                          )}
                        </div>
                        <div className="alert-log-meta">
                          <span><strong>Server ID:</strong> {a.server_id}</span>
                          <span><strong>Triggered:</strong> {new Date(a.triggered_at).toLocaleString()}</span>
                          {a.resolved_at && (
                            <span style={{ color: 'var(--color-online)' }}>
                              <strong>Resolved:</strong> {new Date(a.resolved_at).toLocaleString()}
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto' }}>
                            <span className={`alert-status-pill ${a.resolved_at ? 'resolved' : 'active'}`}>
                              {a.resolved_at ? 'resolved' : 'active'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal 
        showSettingsModal={showSettingsModal}
        setShowSettingsModal={setShowSettingsModal}
        selectedServer={selectedServer}
        cpuLimit={cpuLimit}
        setCpuLimit={setCpuLimit}
        ramLimit={ramLimit}
        setRamLimit={setRamLimit}
        diskLimit={diskLimit}
        setDiskLimit={setDiskLimit}
        handleSaveThresholds={handleSaveThresholds}
      />
    </div>
  );
}

export default App;
