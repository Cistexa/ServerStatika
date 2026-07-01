import React from 'react';
import { Layers, Play, Square, RotateCcw } from 'lucide-react';

function DockerTable({ latestMetrics, runningCommandId, handleDockerAction }) {
  if (!latestMetrics) return null;

  return (
    <div className="containers-card">
      <div className="processes-header" style={{ marginBottom: '10px' }}>
        <span className="processes-title">
          <Layers size={18} /> Docker Containers
        </span>
        {latestMetrics.docker_containers && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
            {latestMetrics.docker_containers.length} active
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="containers-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>Status</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {latestMetrics.docker_containers && latestMetrics.docker_containers.length > 0 ? (
              latestMetrics.docker_containers.map((c, idx) => {
                const isStartLoading = runningCommandId === `${c.id}-start`;
                const isStopLoading = runningCommandId === `${c.id}-stop`;
                const isRestartLoading = runningCommandId === `${c.id}-restart`;
                const isLoadingAny = isStartLoading || isStopLoading || isRestartLoading;

                return (
                  <tr key={idx}>
                    <td className="container-name">{c.names}</td>
                    <td className="container-image" title={c.image}>
                      {c.image.length > 15 ? c.image.substring(0, 15) + '...' : c.image}
                    </td>
                    <td style={{ fontSize: '11px' }}>{c.status}</td>
                    <td>
                      <span className={`container-state-badge ${c.state}`}>
                        {c.state}
                      </span>
                    </td>
                    <td>
                      <div className="docker-actions">
                        {c.state !== 'running' ? (
                          <button 
                            disabled={isLoadingAny} 
                            className="docker-btn start" 
                            onClick={() => handleDockerAction(c.id, 'start')}
                            title="Start Container"
                          >
                            {isStartLoading ? <div className="btn-spinner" /> : <Play size={10} />}
                          </button>
                        ) : (
                          <button 
                            disabled={isLoadingAny} 
                            className="docker-btn stop" 
                            onClick={() => handleDockerAction(c.id, 'stop')}
                            title="Stop Container"
                          >
                            {isStopLoading ? <div className="btn-spinner" /> : <Square size={10} />}
                          </button>
                        )}
                        <button 
                          disabled={isLoadingAny} 
                          className="docker-btn restart" 
                          onClick={() => handleDockerAction(c.id, 'restart')}
                          title="Restart Container"
                        >
                          {isRestartLoading ? <div className="btn-spinner" /> : <RotateCcw size={10} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                  No Docker containers running or daemon offline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DockerTable;
