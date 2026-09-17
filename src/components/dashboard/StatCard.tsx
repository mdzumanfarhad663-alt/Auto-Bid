import React from 'react';
import { TrendingUp, Minus } from 'lucide-react';

interface StatCardProps {
  id: string;
  title: string;
  period: string;
  value: number | string;
  variant: 'blue' | 'purple' | 'amber' | 'emerald';
  icon: React.ComponentType<{ className?: string }>;
  trendText?: string;
  hasData?: boolean;
  sparkline?: number[];
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  period,
  value,
  variant,
  icon: Icon,
  trendText = 'No data yet',
  hasData = true,
  sparkline = [4, 6, 8, 5, 9, 12, 14],
}) => {
  const variantStyles = {
    blue: {
      iconBg: 'bg-blue-100 text-blue-600',
      stroke: '#2563eb',
      fill: 'url(#gradient-blue)',
      trendBg: 'bg-blue-50 text-blue-700',
    },
    purple: {
      iconBg: 'bg-purple-100 text-purple-600',
      stroke: '#9333ea',
      fill: 'url(#gradient-purple)',
      trendBg: 'bg-purple-50 text-purple-700',
    },
    amber: {
      iconBg: 'bg-amber-100 text-amber-600',
      stroke: '#d97706',
      fill: 'url(#gradient-amber)',
      trendBg: 'bg-amber-50 text-amber-700',
    },
    emerald: {
      iconBg: 'bg-emerald-100 text-emerald-600',
      stroke: '#059669',
      fill: 'url(#gradient-emerald)',
      trendBg: 'bg-emerald-50 text-emerald-700',
    },
  };

  const style = variantStyles[variant];

  // Generate smooth SVG path for sparkline
  const minVal = Math.min(...sparkline);
  const maxVal = Math.max(...sparkline, minVal + 1);
  const points = sparkline.map((val, idx) => {
    const x = (idx / (sparkline.length - 1)) * 90 + 5;
    const y = 32 - ((val - minVal) / (maxVal - minVal)) * 24;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points.join(' L ')} L 95,36 L 5,36 Z`;

  return (
    <div
      id={id}
      className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </div>
        <div className={`w-8 h-8 rounded-full ${style.iconBg} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {/* Main Metric & Sparkline */}
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none font-mono">
            {value}
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">
            {period}
          </div>
        </div>

        {/* Mini Sparkline Chart */}
        <div className="w-24 h-9 shrink-0">
          <svg viewBox="0 0 100 36" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="gradient-amber" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="gradient-emerald" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {hasData && (
              <>
                <path d={areaD} fill={style.fill} />
                <path
                  d={pathD}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {!hasData && (
              <line
                x1="5"
                y1="20"
                x2="95"
                y2="20"
                stroke="#e2e8f0"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Footer Trend Line */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
          {hasData && trendText.includes('+') ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <Minus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span>{trendText}</span>
        </div>
      </div>
    </div>
  );
};
