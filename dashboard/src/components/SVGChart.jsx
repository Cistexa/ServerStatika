import React from 'react';
import { Activity, Info } from 'lucide-react';

function SVGChart({ metrics, activeChartMetric, setActiveChartMetric }) {
  const renderSVGChart = () => {
    if (metrics.length === 0) {
      return (
        <div className="empty-state">
          <Info size={32} />
          <p>No performance history available. Ensure the agent is reporting.</p>
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
              fill={p.val > 90 ? 'var(--color-alert)' : activeColor} 
              stroke="var(--bg-card)" 
              strokeWidth="1.5" 
            />
            <title>{`${p.val.toFixed(1)}% at ${p.time}`}</title>
          </g>
        ))}
      </svg>
    );
  };

  return (
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
  );
}

export default SVGChart;
