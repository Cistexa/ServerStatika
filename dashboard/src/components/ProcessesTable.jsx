import React from 'react';
import { List, Trash2 } from 'lucide-react';

function ProcessesTable({ latestMetrics, runningCommandId, handleKillProcess }) {
  if (!latestMetrics) return null;

  return (
    <div className="processes-card">
      <div className="processes-header">
        <span className="processes-title"><List size={18} /> Top Processes</span>
      </div>
      <table className="processes-table">
        <thead>
          <tr>
            <th>PID</th>
            <th>Name</th>
            <th>CPU %</th>
            <th>RAM %</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {latestMetrics.top_processes && latestMetrics.top_processes.length > 0 ? (
            latestMetrics.top_processes.map((p, idx) => {
              const isKilling = runningCommandId === `kill-${p.pid}`;
              return (
                <tr key={idx}>
                  <td>{p.pid}</td>
                  <td className="proc-name">{p.name}</td>
                  <td className="proc-cpu-badge">{p.cpu.toFixed(1)}%</td>
                  <td className="proc-ram-badge">{p.ram.toFixed(1)}%</td>
                  <td>
                    <button 
                      disabled={isKilling}
                      className="proc-kill-btn"
                      onClick={() => handleKillProcess(p.pid, p.name)}
                      title="Terminate Process"
                    >
                      {isKilling ? <div className="btn-spinner" /> : <Trash2 size={13} />}
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                No process metrics
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ProcessesTable;
