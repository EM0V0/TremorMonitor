import React, { useState, useEffect, useRef } from 'react';

interface TremorChartProps {
  activeTab: string;
  data?: {
    timestamps: string[];
    values: number[];
    originalDates?: Date[];
  };
  height?: number;
}

/**
 * TremorChart Component
 * 
 * A reusable chart component for displaying tremor data in different time intervals
 * Can use real sensor data or generate mock data when real data is not available
 * Supports different time views: realtime, hourly, daily, weekly
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
  
  // Generate data points for the chart - from real data or mock data
  const generateDataPoints = () => {
    // Determine min and max for proper scaling
    const getMinMaxValues = () => {
      if (data && data.values.length > 0) {
        return {
          minValue: Math.min(...data.values),
          maxValue: Math.max(...data.values)
        };
      }
      return { minValue: 0, maxValue: 100 }; // Default range if no data
    };

    const { minValue, maxValue } = getMinMaxValues();
    
    // SVG y-axis is inverted (0 at top, higher values go down)
    // Map data values to SVG coordinate space (0-30)
    const mapValueToY = (value: number) => {
      // Scale factor to match the Y-axis compression
      const scaleFactor = 0.7; // Also scale down to 70% to match axis
      const scaledValue = value / scaleFactor;
      
      // Create a padding of 10% at top and bottom
      const adjustedMax = Math.max(maxValue * (1/scaleFactor), 100);
      const padding = (adjustedMax - minValue) * 0.1;
      const paddedMin = Math.max(0, minValue - padding);
      const paddedMax = adjustedMax + padding;
      
      // 5 is top padding, 25 is available height
      return 5 + 25 * (1 - (scaledValue - paddedMin) / (paddedMax - paddedMin || 1));
    };
    
    // If real data is available, use it
    if (data && data.values.length > 0) {
      // Allow more data points for better visualization
      const maxPoints = 50; // Show up to 50 data points
      const step = data.values.length > maxPoints ? Math.floor(data.values.length / maxPoints) : 1;
      const filteredValues: number[] = [];
      const filteredTimestamps: string[] = [];
      
      // Check if all timestamps are the same (edge case with backend data)
      const allSameTimestamp = data.timestamps.every(t => t === data.timestamps[0]);
      
      if (allSameTimestamp) {
        // Generate synthetic timestamps for better visualization
        console.log('All timestamps are identical - generating synthetic timestamps');
        for (let i = 0; i < data.values.length; i += step) {
          if (filteredValues.length < maxPoints) {
            filteredValues.push(data.values[i]);
            // Create synthetic timestamps spaced 1 second apart
            const now = new Date();
            const syntheticDate = new Date(now.getTime() - (i * 1000));
            filteredTimestamps.push(syntheticDate.toLocaleTimeString('en-US', {
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit'
            }));
          }
        }
      } else {
        // Normal case - sample data points at regular intervals
        for (let i = 0; i < data.values.length; i += step) {
          if (filteredValues.length < maxPoints) {
            filteredValues.push(data.values[i]);
            filteredTimestamps.push(data.timestamps[i]);
          }
        }
      }
      
      // Ensure we have at least 2 points for proper line rendering
      if (filteredValues.length === 1) {
        filteredValues.push(filteredValues[0]);
        filteredTimestamps.push(filteredTimestamps[0] + ' (copy)');
      }
      
      return filteredValues.map((value, index) => {
        // For SVG, x=0 is left, x=100 is right (horizontal direction is reversed for time series)
        const x = 100 - (index * (100 / (filteredValues.length - 1 || 1))); 
        return {
          x: x,
          y: mapValueToY(value), // Map to SVG coordinates
          originalValue: value,
          timestamp: filteredTimestamps[index]
        };
      });
    }
    
    // In SVG coordinate system, smaller y values represent higher positions
    // Generate mock data based on active tab
    const points = [];
    
    // Generate appropriate timestamps for each tab type
    const mockTimestamps = generateMockTimestamps(activeTab);
    
    // Generate Y values with natural variation
    const yValues = generateYValues(activeTab);
    
    // Create data points with proper distribution
    for (let i = 0; i < yValues.length; i++) {
      points.push({
        x: 100 - (i * (100 / (yValues.length - 1))),
        y: mapValueToY(yValues[i]), // Map mock values to SVG coordinates
        originalValue: yValues[i],
        timestamp: mockTimestamps[i] || `${i} units ago`
      });
    }
    
    return points;
  };
  
  // Generate mock timestamps based on active tab
  const generateMockTimestamps = (tab: string) => {
    const now = new Date();
    
    switch(tab) {
      case 'realtime':
        return Array(6).fill(0).map((_, i) => {
          const time = new Date(now.getTime() - i * 10000); // 10 seconds intervals
          return time.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        });
      
      case 'hourly':
        return Array(6).fill(0).map((_, i) => {
          const time = new Date(now.getTime() - i * 3600000); // 1 hour intervals
          return time.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        });
      
      case 'daily':
        return Array(6).fill(0).map((_, i) => {
          const date = new Date(now.getTime() - i * 86400000); // 1 day intervals
          return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        });
      
      case 'weekly':
        return Array(6).fill(0).map((_, i) => {
          const date = new Date(now.getTime() - i * 604800000); // 1 week intervals
          return date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
        });
      
      default:
        return Array(6).fill('');
    }
  };
  
  // Generate Y values with natural variations for mock data
  const generateYValues = (tab: string) => {
    // Base values with natural fluctuations
    let baseValue = 60; // Center around 60 for better visualization
    const values: number[] = [];
    
    for (let i = 0; i < 6; i++) {
      // Add some randomness but maintain a trend
      const variation = Math.sin(i * 0.8) * 15 + (Math.random() * 10 - 5);
      const value = Math.max(10, Math.min(90, baseValue + variation));
      values.push(value);
      
      // Adjust base value to create a slight trend
      if (tab === 'realtime') {
        baseValue += 3 * (Math.random() - 0.5);
      } else {
        baseValue += 2 * (Math.random() - 0.5);
      }
    }
    
    return values;
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
      const minValue = Math.min(...data.values);
      
      // Add padding to the range and compress scale to about 70% of original
      const scaleFactor = 0.7; // Scale down to 70% of the original
      const adjustedMax = Math.max(maxValue * (1/scaleFactor), 100); // Ensure scale can display up to 100
      const padding = (adjustedMax - minValue) * 0.1;
      const paddedMin = Math.max(0, Math.floor((minValue - padding) / 10) * 10);
      const paddedMax = Math.ceil((adjustedMax + padding) / 10) * 10;
      const range = paddedMax - paddedMin;
      
      // Calculate step size for 6 labels
      const step = range / 5;
      
      // Generate evenly spaced labels
      return Array.from({ length: 6 }).map((_, i) => 
        Math.round(paddedMax - i * step)
      );
    }
    
    // Default labels for mock data - scaled down
    return [150, 120, 90, 60, 30, 0];
  };

  // Get x axis values based on active tab
  const getXAxisValues = () => {
    // If we have actual data, use timestamps from the data
    if (data && data.values.length > 0) {
      // Get 6 evenly spaced data points across the dataset for X-axis labels
      const numLabels = 6;
      const step = Math.max(1, Math.floor(data.timestamps.length / numLabels));
      const labels = [];
      
      for (let i = 0; i < numLabels; i++) {
        const idx = Math.min(i * step, data.timestamps.length - 1);
        if (idx >= 0 && idx < data.timestamps.length) {
          labels.push(data.timestamps[idx]);
        }
      }
      
      // Ensure we have reasonable number of labels
      while (labels.length < numLabels) {
        labels.push('');
      }
      
      return labels;
    }
    
    // Default mock labels when no data is provided
    switch (activeTab) {
      case 'realtime':
        // For real-time view, show time in seconds from now
        return Array.from({ length: 6 }).map((_, i) => {
          return `${i * 12}s`;
        });
      case 'hourly':
        // For hourly view, show hours
        return Array.from({ length: 6 }).map((_, i) => {
          const value = i * 1.2; // Distributes 0h to 6h across the axis
          return `${value.toFixed(1)}h`;
        });
      case 'daily':
        // For daily view, show days
        return Array.from({ length: 6 }).map((_, i) => {
          return `${i}d`;
        });
      case 'weekly':
        // For weekly view, show weeks
        return Array.from({ length: 6 }).map((_, i) => {
          return `${i}w`;
        });
      default:
        return Array.from({ length: 6 }).map((_, i) => `${i}`);
    }
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
        <div className="absolute inset-0 px-4 pt-12 pb-16">
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
              
              {/* X axis */}
              <g>
                <line 
                  x1="0" 
                  y1="30" 
                  x2="100" 
                  y2="30" 
                  stroke="#CBD5E1" 
                  strokeWidth="0.5"
                />
                {[0, 20, 40, 60, 80, 100].map((pos, i) => (
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
            <div className="absolute top-0 right-2 -mt-3">
              <span className="text-xs font-medium text-gray-500 bg-white bg-opacity-75 px-2 py-1 rounded">
                {activeTab.toUpperCase()} DATA
              </span>
            </div>
          </div>
        </div>
        
        {/* X-axis time scale ticks - Fixed positioning to avoid overlap */}
        <div className="absolute bottom-4 left-0 right-0 px-8">
          <div className="relative h-6 w-full">
            {xAxisValues && xAxisValues.map((value, index) => {
              // Calculate position based on the number of values and chart width
              const totalValues = xAxisValues.length;
              const position = index * (100 / (totalValues - 1));
              
              return (
                <div 
                  key={`x-value-${index}`} 
                  className="absolute -translate-x-1/2 text-xs text-gray-500"
                  style={{ 
                    left: `${position}%`,
                    top: 0
                  }}
                >
                  {value}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Y-axis labels - Improved positioning */}
        <div className="absolute top-2 left-2 bottom-10 flex flex-col justify-between text-xs text-gray-500">
          {yAxisLabels.map((label, index) => (
            <span key={`y-label-${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TremorChart; 