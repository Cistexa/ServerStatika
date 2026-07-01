import React from 'react';
import { TrendingUp, HardDrive, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const formatSpeed = (bytesSec) => {
  if (bytesSec === undefined || bytesSec === null || isNaN(bytesSec)) return '0 B/s';
  if (bytesSec < 1024) return `${bytesSec.toFixed(0)} B/s`;
  if (bytesSec < 1024 * 1024) return `${(bytesSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesSec / (1024 * 1024)).toFixed(1)} MB/s`;
};

function ThroughputCards({ latestMetrics }) {
  if (!latestMetrics) return null;

  return (
    <div className="metrics-card-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '28px' }}>
      <div className="metric-card" style={{ padding: '20px 24px' }}>
        <div className="metric-card-header" style={{ marginBottom: '14px' }}>
          <span className="metric-title" style={{ fontSize: '14px' }}>
            <TrendingUp size={16} color="var(--color-cpu)" /> Network Throughput
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.08)', padding: '10px', borderRadius: '10px', color: 'var(--color-cpu)' }}>
              <ArrowDownLeft size={20} />
            </div>
            <div>
              <div className="stat-label" style={{ fontSize: '10px' }}>Download (Rx)</div>
              <div className="speed-badge">{formatSpeed(latestMetrics.net_recv_bytes_sec)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(217, 70, 239, 0.08)', padding: '10px', borderRadius: '10px', color: 'var(--color-ram)' }}>
              <ArrowUpRight size={20} />
            </div>
            <div>
              <div className="stat-label" style={{ fontSize: '10px' }}>Upload (Tx)</div>
              <div className="speed-badge">{formatSpeed(latestMetrics.net_sent_bytes_sec)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="metric-card" style={{ padding: '20px 24px' }}>
        <div className="metric-card-header" style={{ marginBottom: '14px' }}>
          <span className="metric-title" style={{ fontSize: '14px' }}>
            <HardDrive size={16} color="var(--color-disk)" /> Disk Activity (Read/Write)
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '10px', borderRadius: '10px', color: 'var(--color-disk)' }}>
              <ArrowDownLeft size={20} />
            </div>
            <div>
              <div className="stat-label" style={{ fontSize: '10px' }}>Read speed</div>
              <div className="speed-badge">{formatSpeed(latestMetrics.disk_read_bytes_sec)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '10px', borderRadius: '10px', color: 'var(--text-secondary)' }}>
              <ArrowUpRight size={20} />
            </div>
            <div>
              <div className="stat-label" style={{ fontSize: '10px' }}>Write speed</div>
              <div className="speed-badge">{formatSpeed(latestMetrics.disk_write_bytes_sec)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThroughputCards;
