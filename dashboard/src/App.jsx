import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Server as ServerIcon, 
  AlertTriangle, 
  Cpu, 
  Database, 
  HardDrive, 
  CheckCircle, 
  Clock, 
  Terminal, 
  RefreshCw,
  Info
} from 'lucide-react';

const API_BASE = window.location.port === '5173' ? 'http://localhost:8080' : '';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'alerts'
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeChartMetric, setActiveChartMetric] = useState('cpu'); // 'cpu' | 'ram' | 'disk'
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Fetch servers list
  const fetchServers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/servers`);
      if (res.ok) {
        const data = await res.json();
        setServers(data || []);
        // Set first server as selected if none is selected
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
      const res = await fetch(`${API_BASE}/api/servers/${serverId}/metrics?limit=30`);
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

  // Fetch metrics when selected server changes or periodically
  useEffect(() => {
    fetchMetrics(selectedServerId);
    const interval = setInterval(() => {
      fetchMetrics(selectedServerId);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedServerId]);

  // Selected server details
  const selectedServer = servers.find(s => s.id === selectedServerId);
  const latestMetricRecord = metrics[metrics.length - 1];
  const latestMetrics = latestMetricRecord ? latestMetricRecord.metrics : null;

  // Overview stats
  const totalServers = servers.length;
  const onlineServers = servers.filter(s => s.status === 'online').length;
  const activeAlerts = alerts.filter(a => !a.resolved_at).length;

  // Custom SVG Chart Generator
  const renderSVGChart = () => {
    if (metrics.length === 0) {
      return (
        <div className="empty-state">
          <Info size={32} />
          <p>No metrics history available. Ensure the agent is reporting.</p>
        </div>
      );
    }

    const width = 600;
    const height = 220;
    const padding = 40;
    
    // Get values based on selected metric tab
    const points = metrics.map((m, index) => {
      let val = 0;
      if (activeChartMetric === 'cpu') val = m.metrics.cpu_usage_percent;
      else if (activeChartMetric === 'ram') val = m.metrics.ram.percent;
      else if (activeChartMetric === 'disk') val = m.metrics.disk.percent;

      return {
        x: padding + (index / Math.max(1, metrics.length - 1)) * (width - padding * 2),
        y: height - padding - (val / 100) * (height - padding * 2),
        val: val,
        time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    });

    const activeColor = activeChartMetric === 'cpu' ? 'var(--color-cpu)' :
                        activeChartMetric === 'ram' ? 'var(--color-ram)' : 'var(--color-disk)';

    // Build SVG Path
    let pathD = "";
    let areaD = "";
    if (points.length > 0) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      areaD = `M ${points[0].x} ${height - padding}`;
      
      for (let i = 0; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
        areaD += ` L ${points[i].x} ${points[i].y}`;
      }
      
      areaD += ` L ${points[points.length - 1].x} ${height - padding} Z`;
    }

    return (
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {[0, 25, 50, 75, 100].map((grid, i) => {
          const y = height - padding - (grid / 100) * (height - padding * 2);
          return (
            <g key={i}>
              <line 
                x1={padding} 
                y1={y} 
                x2={width - padding} 
                y2={y} 
                stroke="rgba(255,255,255,0.03)" 
                strokeWidth="1" 
              />
              <text 
                x={padding - 10} 
                y={y + 4} 
                fill="var(--text-muted)" 
                fontSize="10" 
                textAnchor="end"
                fontWeight="600"
              >
                {grid}%
              </text>
            </g>
          );
        })}

        {/* X axis labels (first and last timestamp) */}
        {points.length > 1 && (
          <>
            <text 
              x={points[0].x} 
              y={height - padding + 20} 
              fill="var(--text-muted)" 
              fontSize="10" 
              fontWeight="600"
            >
              {points[0].time}
            </text>
            <text 
              x={points[points.length - 1].x} 
              y={height - padding + 20} 
              fill="var(--text-muted)" 
              fontSize="10" 
              textAnchor="end"
              fontWeight="600"
            >
              {points[points.length - 1].time}
            </text>
          </>
        )}

        {/* Area fill */}
        {areaD && <path d={areaD} fill="url(#chartGradient)" />}

        {/* Stroke path */}
        {pathD && (
          <path 
            d={pathD} 
            fill="none" 
            stroke={activeColor} 
            strokeWidth="2.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive dots */}
        {points.map((p, i) => (
          <g key={i} className="chart-dot-group">
            <circle 
              cx={p.x} 
              cy={p.y} 
              r="3.5" 
              fill={activeColor} 
              stroke="var(--bg-card)" 
              strokeWidth="1.5" 
            />
            {/* Simple SVG tooltip on hover */}
            <title>{`${p.val.toFixed(1)}% at ${p.time}`}</title>
          </g>
        ))}
      </svg>
    );
  };

  // Helper to render radial/circular dashboard dial
  const renderGauge = (percent, colorClass, colorGlow) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    return (
      <div className="metric-dial-container">
        <svg className="gauge-svg">
          <circle className="gauge-bg" cx="60" cy="60" r={radius} />
          <circle 
            className="gauge-fill" 
            cx="60" 
            cy="60" 
            r={radius} 
            stroke={colorClass}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ filter: `drop-shadow(0 0 4px ${colorGlow})` }}
          />
        </svg>
        <div className="metric-value-label">
          <span className="metric-number">{percent.toFixed(1)}</span>
          <span className="metric-unit">%</span>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Section */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Activity size={20} />
          </div>
          <span className="logo-text">ServerStatika</span>
        </div>

        <section className="menu-section">
          <div className="menu-title">Navigation</div>
          <div 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            <span>Dashboard</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            <AlertTriangle size={18} />
            <span>Alert Logs</span>
            {activeAlerts > 0 && (
              <span style={{
                backgroundColor: 'var(--color-alert)',
                color: 'white',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '99px',
                marginLeft: 'auto',
                fontWeight: '800'
              }}>{activeAlerts}</span>
            )}
          </div>
        </section>

        <section className="menu-section" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="menu-title">Monitored Servers</div>
          <div className="server-list-container">
            {servers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', paddingLeft: '12px' }}>
                No active servers.
              </p>
            ) : (
              servers.map(s => (
                <div 
                  key={s.id}
                  className={`server-item ${selectedServerId === s.id && activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedServerId(s.id);
                    setActiveTab('dashboard');
                  }}
                >
                  <div className="server-item-info">
                    <span className="server-item-name">{s.name}</span>
                    <span className="server-item-ip">{s.ip_address}</span>
                  </div>
                  <span className={`status-indicator ${s.status}`} title={s.status} />
                </div>
              ))
            )}
          </div>
        </section>
      </aside>

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
                    <h2>
                      {selectedServer.name} 
                      <span className={`server-badge ${selectedServer.status}`}>
                        {selectedServer.status}
                      </span>
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
                  <div className="metrics-card-grid">
                    <div className="metric-card">
                      <div className="metric-card-header">
                        <span className="metric-title"><Cpu size={18} color="var(--color-cpu)" /> CPU Usage</span>
                      </div>
                      {renderGauge(latestMetrics.cpu_usage_percent, 'var(--color-cpu)', 'var(--color-cpu-glow)')}
                      <div className="metric-footer">
                        <span>Metrics status</span>
                        <span style={{ color: 'var(--color-online)' }}>Live streaming</span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-card-header">
                        <span className="metric-title"><Database size={18} color="var(--color-ram)" /> Memory (RAM)</span>
                      </div>
                      {renderGauge(latestMetrics.ram.percent, 'var(--color-ram)', 'var(--color-ram-glow)')}
                      <div className="metric-footer">
                        <span>Used: <strong>{latestMetrics.ram.used_mb} MB</strong></span>
                        <span>Total: <strong>{latestMetrics.ram.total_mb} MB</strong></span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-card-header">
                        <span className="metric-title"><HardDrive size={18} color="var(--color-disk)" /> Storage (Disk)</span>
                      </div>
                      {renderGauge(latestMetrics.disk.percent, 'var(--color-disk)', 'var(--color-disk-glow)')}
                      <div className="metric-footer">
                        <span>Used: <strong>{latestMetrics.disk.used_gb} GB</strong></span>
                        <span>Total: <strong>{latestMetrics.disk.total_gb} GB</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* SVG Charts & Processes Row */}
                  <div className="dashboard-details-row">
                    <div className="chart-card">
                      <div className="chart-header">
                        <span className="chart-title"><Activity size={18} /> Performance History</span>
                        <div className="chart-tabs">
                          <button 
                            className={`chart-tab-btn ${activeChartMetric === 'cpu' ? 'active' : ''}`}
                            onClick={() => setActiveChartMetric('cpu')}
                          >
                            CPU
                          </button>
                          <button 
                            className={`chart-tab-btn ${activeChartMetric === 'ram' ? 'active' : ''}`}
                            onClick={() => setActiveChartMetric('ram')}
                          >
                            RAM
                          </button>
                          <button 
                            className={`chart-tab-btn ${activeChartMetric === 'disk' ? 'active' : ''}`}
                            onClick={() => setActiveChartMetric('disk')}
                          >
                            Disk
                          </button>
                        </div>
                      </div>
                      <div className="chart-container">
                        {renderSVGChart()}
                      </div>
                    </div>

                    <div className="processes-card">
                      <div className="processes-header">
                        <span className="processes-title"><Terminal size={18} /> Top Processes</span>
                      </div>
                      <table className="processes-table">
                        <thead>
                          <tr>
                            <th>PID</th>
                            <th>Name</th>
                            <th>CPU %</th>
                            <th>RAM %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestMetrics.top_processes && latestMetrics.top_processes.length > 0 ? (
                            latestMetrics.top_processes.map((p, idx) => (
                              <tr key={idx}>
                                <td>{p.pid}</td>
                                <td className="proc-name">{p.name}</td>
                                <td className="proc-cpu-badge">{p.cpu.toFixed(1)}%</td>
                                <td className="proc-ram-badge">{p.ram.toFixed(1)}%</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                No process metrics
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
    </div>
  );
}

export default App;
