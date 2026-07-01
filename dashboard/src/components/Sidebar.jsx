import React from 'react';
import { Activity, Server as ServerIcon, AlertTriangle } from 'lucide-react';

function Sidebar({ servers, selectedServerId, setSelectedServerId, activeTab, setActiveTab, activeAlerts }) {
  return (
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
  );
}

export default Sidebar;
