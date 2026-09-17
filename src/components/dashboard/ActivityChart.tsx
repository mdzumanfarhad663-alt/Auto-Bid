import React, { useState } from 'react';
import { ActivityPoint } from '../../types.ts';

interface ActivityChartProps {
  points?: ActivityPoint[];
  totalScans?: number;
  totalBids?: number;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  points = [
    { label: '-24h', scans: 5, bids: 0 },
    { label: '-18h', scans: 12, bids: 1 },
    { label: '-12h', scans: 8, bids: 1 },
    { label: '-6h', scans: 15, bids: 2 },
    { label: 'Now', scans: 4, bids: 0 },
  ],
  totalScans = 35,
  totalBids = 4,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // SVG Chart Dimensions
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingTop = 20;
  const paddingBottom = 30;

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.scans, p.bids)),
    10
  );

  const getX = (index: number) => {
    if (points.length <= 1) return paddingX;
    return paddingX + (index / (points.length - 1)) * (width - 2 * paddingX);
  };

  const getY = (val: number) => {
    const chartHeight = height - paddingTop - paddingBottom;
    return height - paddingBottom - (val / maxVal) * chartHeight;
  };

  // Generate smooth paths
  const scansPoints = points.map((p, i) => `${getX(i)},${getY(p.scans)}`);
  const bidsPoints = points.map((p, i) => `${getX(i)},${getY(p.bids)}`);

  const scansPath = `M ${scansPoints.join(' L ')}`;
  const scansArea = `M ${scansPoints.join(' L ')} L ${getX(points.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z`;

  const bidsPath = `M ${bidsPoints.join(' L ')}`;
  const bidsArea = `M ${bidsPoints.join(' L ')} L ${getX(points.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z`;

  return (
    <div
      id="activity-chart-card"
      className="p-5 sm:p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between"
    >
      {/* Header with Title & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          ACTIVITY · LAST 24H
        </h2>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
            <span>{totalScans} scans</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            <span>{totalBids} bids</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="mt-4 relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 sm:h-52 overflow-visible"
        >
          <defs>
            <linearGradient id="chart-grad-purple" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="chart-grad-blue" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingTop + ratio * (height - paddingTop - paddingBottom);
            return (
              <line
                key={ratio}
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
            );
          })}

          {/* Area Fills */}
          <path d={scansArea} fill="url(#chart-grad-purple)" />
          <path d={bidsArea} fill="url(#chart-grad-blue)" />

          {/* Lines */}
          <path
            d={scansPath}
            fill="none"
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={bidsPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points and Interactivity */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const yScans = getY(p.scans);
            const yBids = getY(p.bids);
            const isHovered = hoveredIdx === idx;

            return (
              <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}>
                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={height - paddingBottom}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Scans point */}
                <circle
                  cx={x}
                  cy={yScans}
                  r={isHovered ? 5 : 3.5}
                  fill="#9333ea"
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-all"
                />

                {/* Bids point */}
                <circle
                  cx={x}
                  cy={yBids}
                  r={isHovered ? 5 : 3.5}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-all"
                />

                {/* X Axis Label */}
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className="text-[11px] font-medium fill-slate-400 select-none"
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip if Hovered */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] shadow-lg flex items-center gap-3 pointer-events-none"
          >
            <span className="font-semibold">{points[hoveredIdx].label}</span>
            <span className="text-purple-300 font-mono">{points[hoveredIdx].scans} scans</span>
            <span className="text-blue-300 font-mono">{points[hoveredIdx].bids} bids</span>
          </div>
        )}
      </div>
    </div>
  );
};
