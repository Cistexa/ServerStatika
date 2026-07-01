import React from 'react';
import { Terminal, Cpu } from 'lucide-react';

function TerminalPanel({ 
  terminalActiveTab, 
  setTerminalActiveTab, 
  accumulatedLogs, 
  terminalConsoleRef, 
  selectedDiagnosticCmd, 
  setSelectedDiagnosticCmd, 
  isExecutingDiagnostic, 
  handleRunDiagnostic, 
  commandHistory 
}) {
  return (
    <div className="terminal-card">
      <header className="terminal-header">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span 
            className={`terminal-tab-header ${terminalActiveTab === 'logs' ? 'active' : ''}`}
            onClick={() => setTerminalActiveTab('logs')}
          >
            <Terminal size={16} /> Live Log Stream
          </span>
          <span 
            className={`terminal-tab-header ${terminalActiveTab === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setTerminalActiveTab('diagnostics')}
          >
            <Cpu size={16} /> Remote Diagnostics
          </span>
        </div>
        <div className="terminal-controls">
          <div className="terminal-dot red" />
          <div className="terminal-dot yellow" />
          <div className="terminal-dot green" />
        </div>
      </header>
      
      {terminalActiveTab === 'logs' ? (
        <div className="terminal-console" ref={terminalConsoleRef}>
          {accumulatedLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>
              Waiting for application log lines... Make sure log file exists and is populated.
            </div>
          ) : (
            accumulatedLogs.map((logLine, idx) => (
              <div className="terminal-line" key={idx}>
                <span className="terminal-time">
                  [{new Date(logLine.timestamp).toLocaleTimeString()}]
                </span>
                <span className="terminal-src">{logLine.source}</span>
                <span className={`terminal-level ${logLine.level}`}>
                  {logLine.level}
                </span>
                <span className="terminal-msg">{logLine.message}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="terminal-diagnostics-container">
          <div className="diagnostics-action-bar">
            <select 
              value={selectedDiagnosticCmd}
              onChange={(e) => setSelectedDiagnosticCmd(e.target.value)}
              className="diagnostic-select"
            >
              <option value="ping">Ping Gateway (8.8.8.8)</option>
              <option value="netstat">Active Port Connections</option>
              <option value="diskspace">Detailed Disk Partition Space</option>
            </select>
            <button 
              disabled={isExecutingDiagnostic}
              onClick={handleRunDiagnostic}
              className="diagnostic-run-btn"
            >
              {isExecutingDiagnostic ? 'Running...' : 'Run Diagnostic Command'}
            </button>
          </div>
          
          <div className="terminal-console diagnostics-output-console">
            {commandHistory.filter(c => c.command_type === 'diagnostics').length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                No diagnostic commands executed yet. Select a command and click run.
              </div>
            ) : (
              commandHistory.filter(c => c.command_type === 'diagnostics').map((cmd, idx) => {
                let innerCmd = "";
                try {
                  const parsed = JSON.parse(cmd.payload);
                  innerCmd = parsed.command;
                } catch(e) {}

                return (
                  <div key={cmd.id} className="diagnostic-run-block">
                    <div className="diagnostic-run-header">
                      <span className="diagnostic-cmd-text">&gt; check_{innerCmd}</span>
                      <span className={`diagnostic-status-label ${cmd.status}`}>{cmd.status}</span>
                      <span className="diagnostic-time">{new Date(cmd.created_at).toLocaleTimeString()}</span>
                    </div>
                    {cmd.result ? (
                      <pre className="diagnostic-pre-result">{cmd.result}</pre>
                    ) : (
                      <div className="diagnostic-pending-msg">
                        Command sent to agent queue. Waiting for execution (takes up to 5 seconds)...
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TerminalPanel;
