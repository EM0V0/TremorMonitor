import React, { useState, useEffect, useRef } from 'react';

interface TremorChartProps {
  activeTab: string;
  data?: {
    timestamps: string[];
    values: number[];
  };
  height?: number;
}

/**
 * TremorChart Component
 * 
 * A reusable chart component for displaying tremor data in different time intervals
 * Can use real sensor data or generate mock data when real data is not available
 */
const TremorChart: React.FC<TremorChartProps> = ({ 
  activeTab, 
  data, 
  height = 320 
}) => {
  // Animation state
  const [isAnimated, setIsAnimated] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState<{x: number, y: number, value: number, timestamp: string} | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Animate chart on tab change
  useEffect(() => {
    setIsAnimated(false);
    const timer = setTimeout(() => setIsAnimated(true), 100);
    return () => clearTimeout(timer);
  }, [activeTab, data]);

  // Handle mouse leave for tooltip
  const handleMouseLeave = () => {
    setTooltipInfo(null);
  };
  
  // Get time labels based on active tab or real data
  const getTimeLabels = () => {
    // If real data is available, use its timestamps
    if (data && data.timestamps.length > 0) {
      // Format timestamps based on activeTab if needed
      if (activeTab === 'realtime') {
        return data.timestamps.map(ts => ts.split(' ')[1]); // Only show time part
      }
      return data.timestamps;
    }
    
    // Fallback to mock time labels
    switch (activeTab) {
      case 'realtime':
        return ['Now', '-10s', '-20s', '-30s', '-40s', '-50s', '-60s'];
      case 'hourly':
        return ['Now', '-1h', '-2h', '-3h', '-4h', '-5h', '-6h'];
      case 'daily':
        return ['Today', 'Yesterday', '-2d', '-3d', '-4d', '-5d', '-6d'];
      case 'weekly':
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      default:
        return ['Now', '-10s', '-20s', '-30s', '-40s', '-50s', '-60s'];
    }
  };

  // Generate data points for the chart - from real data or mock data
  const generateDataPoints = () => {
    // If real data is available, use it
    if (data && data.values.length > 0) {
      const maxValue = Math.max(...data.values);
      const scaleFactor = maxValue > 0 ? 20 / maxValue : 1; // Scale to fit chart height
      
      return data.values.map((value, index) => ({
        x: 100 - (index * (100 / (data.values.length - 1))), // Distribute evenly on x-axis
        y: 25 - (value * scaleFactor), // Scale to fit in chart, flipped for SVG coords
        originalValue: value,
        timestamp: data.timestamps[index]
      }));
    }
    
    // In SVG coordinate system, smaller y values represent higher positions
    // Keep y values in a range of 5-25 to ensure chart is visible
    const points = [];
    const mockTimestamps = getTimeLabels();
    
    switch(activeTab) {
      case 'realtime':
        // Adjust y values to prevent excessive curve bending
        points.push({ x: 0, y: 15, originalValue: 5.2, timestamp: mockTimestamps[0] });   // Now
        points.push({ x: 20, y: 10, originalValue: 7.8, timestamp: mockTimestamps[1] });  // -10s
        points.push({ x: 40, y: 5, originalValue: 9.5, timestamp: mockTimestamps[2] });   // -20s
        points.push({ x: 60, y: 20, originalValue: 3.1, timestamp: mockTimestamps[3] });  // -30s
        points.push({ x: 80, y: 10, originalValue: 7.7, timestamp: mockTimestamps[4] });  // -40s
        points.push({ x: 100, y: 15, originalValue: 5.3, timestamp: mockTimestamps[5] }); // -50s
        break;
      case 'hourly':
        points.push({ x: 0, y: 12, originalValue: 6.5, timestamp: mockTimestamps[0] });
        points.push({ x: 20, y: 8, originalValue: 8.4, timestamp: mockTimestamps[1] });
        points.push({ x: 40, y: 15, originalValue: 4.8, timestamp: mockTimestamps[2] });
        points.push({ x: 60, y: 5, originalValue: 9.8, timestamp: mockTimestamps[3] });
        points.push({ x: 80, y: 12, originalValue: 6.4, timestamp: mockTimestamps[4] });
        points.push({ x: 100, y: 10, originalValue: 7.6, timestamp: mockTimestamps[5] });
        break;
      case 'daily':
      case 'weekly':
        points.push({ x: 0, y: 10, originalValue: 7.5, timestamp: mockTimestamps[0] });
        points.push({ x: 20, y: 8, originalValue: 8.5, timestamp: mockTimestamps[1] });
        points.push({ x: 40, y: 12, originalValue: 6.3, timestamp: mockTimestamps[2] });
        points.push({ x: 60, y: 9, originalValue: 8.0, timestamp: mockTimestamps[3] });
        points.push({ x: 80, y: 11, originalValue: 7.0, timestamp: mockTimestamps[4] });
        points.push({ x: 100, y: 10, originalValue: 7.5, timestamp: mockTimestamps[5] });
        break;
    }
    
    return points;
  };
  
  // Create bezier curve path with optimized control points
  const createBezierPath = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return '';
    
    // Initial point
    let path = `M${points[0].x},${points[0].y}`;
    
    // Create smooth bezier curves for each pair of points
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Calculate distance between points
      const xDiff = next.x - current.x;
      const yDiff = next.y - current.y;
      
      // Control points: optimize for smoother curves with reduced curvature
      // Adjust control points based on distance and height difference
      const tensionFactor = 0.3; // Lower tension factor for smoother curves
      
      // First control point
      const cp1x = current.x + xDiff * tensionFactor;
      const cp1y = current.y + yDiff * tensionFactor * 0.5;
      
      // Second control point
      const cp2x = next.x - xDiff * tensionFactor;
      const cp2y = next.y - yDiff * tensionFactor * 0.5;
      
      // Add to path
      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }
    
    return path;
  };

  // Handle mouse over data point
  const handleMouseOverPoint = (point: {x: number, y: number, originalValue: number, timestamp: string}) => {
    setTooltipInfo({
      x: point.x,
      y: point.y,
      value: point.originalValue,
      timestamp: point.timestamp
    });
  };

  // Generate data points and convert to SVG coordinate system
  const dataPoints = generateDataPoints();
  
  // Create smooth bezier curve path
  const chartPath = createBezierPath(dataPoints);
  
  // Calculate area fill path (from curve to bottom), with reduced height
  const areaPath = `${chartPath} L${dataPoints[dataPoints.length-1].x},30 L${dataPoints[0].x},30 Z`;

  // Determine max value for Y-axis labels
  const getYAxisLabels = () => {
    if (data && data.values.length > 0) {
      const maxValue = Math.max(...data.values);
      const roundedMax = Math.ceil(maxValue / 10) * 10; // Round up to nearest 10
      const step = roundedMax / 5;
      
      return Array.from({ length: 6 }).map((_, i) => 
        Math.round((roundedMax - i * step) * 10) / 10
      );
    }
    
    // Default labels
    return [10, 8, 6, 4, 2, 0];
  };

  // Get x axis values for realtime mode
  const getXAxisValues = () => {
    if (activeTab !== 'realtime') return null;
    
    return Array.from({ length: 5 }).map((_, i) => {
      const value = i * 15; // 0s, 15s, 30s, 45s, 60s
      return `${value}s`;
    });
  };

  const yAxisLabels = getYAxisLabels();
  const xAxisValues = getXAxisValues();

  return (
    <div className="relative h-80" style={{ height: `${height}px` }} ref={chartRef} onMouseLeave={handleMouseLeave}>
      {/* Chart container with gradients and styles */}
      <div className="absolute inset-0 bg-white rounded-md overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 grid grid-cols-6 grid-rows-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`vline-${i}`} className="border-r border-gray-200 h-full" />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`hline-${i}`} className="border-b border-gray-200 w-full" />
          ))}
        </div>

        {/* Chart visualization - Move chart position up */}
        <div className="absolute inset-0 px-4 pt-20 pb-20">
          <div className="relative h-full w-full">
            {/* Background gradient - More refined gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-blue-50 to-transparent opacity-60"></div>
            
            {/* Main chart SVG - Reduced viewBox height */}
            <svg 
              className={`absolute inset-0 transition-opacity duration-500 ${isAnimated ? 'opacity-100' : 'opacity-0'}`} 
              viewBox="0 0 100 30" 
              preserveAspectRatio="none"
            >
              {/* Line Area fill */}
              <defs>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                </linearGradient>
              </defs>
              
              {/* Area under the line */}
              <path
                d={areaPath}
                fill="url(#areaGradient)"
                opacity="0.4"
              />
              
              {/* The line itself - Thinner, more elegant line */}
              <path
                d={chartPath}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ 
                  strokeDasharray: 1000, 
                  strokeDashoffset: isAnimated ? 0 : 1000,
                  transition: 'stroke-dashoffset 1.5s ease-in-out'
                }}
              />
              
              {/* Add data point circles - Smaller, more refined dots */}
              {dataPoints.map((point, index) => (
                <g key={`svg-point-${index}`}>
                  {/* Invisible larger circle for better hover target */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="5"
                    fill="transparent"
                    onMouseOver={() => handleMouseOverPoint(point)}
                  />
                  {/* Visible small dot */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="0.9"
                    fill="white"
                    stroke="#3B82F6"
                    strokeWidth="0.5"
                    opacity={isAnimated ? 1 : 0}
                    style={{
                      transition: `opacity 0.5s ease-in-out ${index * 0.1}s`,
                    }}
                  />
                </g>
              ))}
              
              {/* X axis for realtime view */}
              {activeTab === 'realtime' && (
                <g>
                  <line 
                    x1="0" 
                    y1="30" 
                    x2="100" 
                    y2="30" 
                    stroke="#CBD5E1" 
                    strokeWidth="0.5"
                  />
                  {[0, 25, 50, 75, 100].map((pos, i) => (
                    <g key={`x-tick-${i}`}>
                      <line 
                        x1={pos} 
                        y1="30" 
                        x2={pos} 
                        y2="31" 
                        stroke="#94A3B8" 
                        strokeWidth="0.5"
                      />
                    </g>
                  ))}
                </g>
              )}
            </svg>
            
            {/* Tooltip */}
            {tooltipInfo && (
              <div 
                className="absolute bg-gray-800 text-white text-xs rounded py-1 px-2 shadow-md z-10 transform -translate-x-1/2 -translate-y-full pointer-events-none"
                style={{
                  left: `${tooltipInfo.x}%`,
                  top: `${tooltipInfo.y * 100 / 30}%`,
                  marginTop: '-10px'
                }}
              >
                <div className="font-medium">{tooltipInfo.timestamp}</div>
                <div>score: {tooltipInfo.value.toFixed(1)}</div>
                {/* Small triangle pointer at bottom */}
                <div 
                  className="absolute border-solid border-t-gray-800 border-t-4 border-x-transparent border-x-4 border-b-0"
                  style={{
                    bottom: '-4px',
                    left: '50%',
                    transform: 'translateX(-50%)'
                  }}
                ></div>
              </div>
            )}
            
            {/* Label for chart type */}
            <div className="absolute top-0 right-2">
              <span className="text-xs font-medium text-gray-500 bg-white bg-opacity-75 px-2 py-1 rounded">
                {activeTab.toUpperCase()} DATA
              </span>
            </div>
          </div>
        </div>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-4 text-xs text-gray-500">
          {getTimeLabels().map((label, index) => (
            <span key={`x-label-${index}`} className="pb-1">{label}</span>
          ))}
        </div>
        
        {/* X-axis values for realtime view */}
        {activeTab === 'realtime' && xAxisValues && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4 text-xs text-gray-400">
            {xAxisValues.map((value, index) => (
              <span key={`x-value-${index}`} style={{ marginLeft: `${index * 25}%` }}>
                {value}
              </span>
            ))}
          </div>
        )}
        
        {/* Y-axis labels */}
        <div className="absolute top-4 left-2 bottom-6 flex flex-col justify-between text-xs text-gray-500">
          {yAxisLabels.map((label, index) => (
            <span key={`y-label-${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TremorChart; 