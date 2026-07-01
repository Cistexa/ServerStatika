import React from 'react';
import { Cpu, Database, HardDrive } from 'lucide-react';

function renderGauge(percent, colorClass, colorGlow) {
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
        <span className="metric-number" style={{ color: percent > 90 ? 'var(--color-alert)' : 'var(--text-primary)' }}>
          {percent.toFixed(1)}
        </span>
        <span className="metric-unit">%</span>
      </div>
    </div>
  );
}

function MetricGauges({ latestMetrics }) {
  if (!latestMetrics) return null;

  return (
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
  );
}

export default MetricGauges;
