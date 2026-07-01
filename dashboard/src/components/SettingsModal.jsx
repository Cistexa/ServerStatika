import React from 'react';

function SettingsModal({ showSettingsModal, setShowSettingsModal, selectedServer, cpuLimit, setCpuLimit, ramLimit, setRamLimit, diskLimit, setDiskLimit, handleSaveThresholds }) {
  if (!showSettingsModal) return null;

  return (
    <div className="modal-overlay">
      <div className="settings-modal">
        <header className="modal-header">
          <h3>Configure Alert Thresholds</h3>
          <button className="close-modal-btn" onClick={() => setShowSettingsModal(false)}>×</button>
        </header>
        <div className="modal-body">
          <p className="modal-desc">
            Set resource limits for host <strong>{selectedServer?.name}</strong>. Exceeding these limits will trigger warning incidents.
          </p>
          
          <div className="setting-input-group">
            <label>CPU Usage Warning Threshold (%):</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="range" 
                min="10" 
                max="99" 
                value={cpuLimit} 
                onChange={(e) => setCpuLimit(e.target.value)} 
                className="threshold-slider"
              />
              <span className="slider-value">{cpuLimit}%</span>
            </div>
          </div>

          <div className="setting-input-group">
            <label>RAM Usage Warning Threshold (%):</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="range" 
                min="10" 
                max="99" 
                value={ramLimit} 
                onChange={(e) => setRamLimit(e.target.value)} 
                className="threshold-slider"
              />
              <span className="slider-value">{ramLimit}%</span>
            </div>
          </div>

          <div className="setting-input-group">
            <label>Disk Space Warning Threshold (%):</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="range" 
                min="10" 
                max="99" 
                value={diskLimit} 
                onChange={(e) => setDiskLimit(e.target.value)} 
                className="threshold-slider"
              />
              <span className="slider-value">{diskLimit}%</span>
            </div>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="modal-cancel-btn" onClick={() => setShowSettingsModal(false)}>Cancel</button>
          <button className="modal-save-btn" onClick={handleSaveThresholds}>Save Thresholds</button>
        </footer>
      </div>
    </div>
  );
}

export default SettingsModal;
