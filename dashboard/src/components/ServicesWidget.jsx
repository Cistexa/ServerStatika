import React from 'react';
import { CheckCircle, Info } from 'lucide-react';

function ServicesWidget({ latestMetrics }) {
  if (!latestMetrics) return null;

  return (
    <div className="processes-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="processes-header">
        <span className="processes-title">
          <CheckCircle size={18} /> Monitored Services Health
        </span>
      </div>
      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        {latestMetrics.services && Object.keys(latestMetrics.services).length > 0 ? (
          <div className="services-widget">
            {Object.entries(latestMetrics.services).map(([name, status]) => (
              <div className="service-status-card" key={name}>
                <span className="service-name">{name}</span>
                <span className={`service-status-badge ${status}`}>{status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px' }}>
            <Info size={24} />
            <p style={{ fontSize: '12px' }}>
              No port monitors configured in config.json.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServicesWidget;
