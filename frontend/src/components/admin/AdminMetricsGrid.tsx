import React, { useEffect, useState } from 'react';
import { HardDrive, Layers, Download, Cpu, Activity } from 'lucide-react';
import type { AdminMetricsData } from '../../types';
import { formatBytes } from '../../utils/_helperFunctions';
import { getInfraMetrics } from '../../services/adminService';

export interface AdminMetricsGridProps {
  isLoading?: boolean;
  refreshKey?: number;
}

/**
 * Pure Presentational Component: Displays 4 System KPI Metric Cards.
 * 100% Stateless - No React Hooks, API calls, or side effects.
 */
export const AdminMetricsGrid: React.FC<AdminMetricsGridProps> = ({ refreshKey }) => {
  const [metrics, setMetrics] = useState<AdminMetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadMetrics() {
    try {
      setIsLoading(true);
      const data = await getInfraMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch admin dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    loadMetrics();
  }, [refreshKey]);

  const cardItems = [
    {
      title: 'Total System Storage',
      value: formatBytes(metrics?.totalStorageBytes || 0),
      subtitle: 'Raw & processed buckets',
      icon: HardDrive,
      accentColor: 'from-indigo-500/20 to-purple-500/20',
      iconColor: 'text-indigo-400',
      borderColor: 'border-indigo-500/20',
      badge: 'MinIO S3',
      badgeColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    },
    {
      title: 'Total Media Assets',
      value: (metrics?.totalAssets ?? 0).toLocaleString(),
      subtitle: 'Uploaded system files',
      icon: Layers,
      accentColor: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-400',
      borderColor: 'border-purple-500/20',
      badge: 'PostgreSQL',
      badgeColor: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    },
    {
      title: 'Global Downloads',
      value: metrics?.totalDownloads.toLocaleString(),
      subtitle: 'Tracked via Redis RAM',
      icon: Download,
      accentColor: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/20',
      badge: 'Redis RAM',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    },
    {
      title: 'Active Workers',
      value: `${metrics?.activeWorkers ?? 0} Nodes`,
      subtitle: 'RabbitMQ Heartbeats',
      icon: Cpu,
      accentColor: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-400',
      borderColor: 'border-amber-500/20',
      badge: (metrics?.activeWorkers ?? 0) > 0 ? 'Healthy' : 'Offline',
      badgeColor: (metrics?.activeWorkers ?? 0) > 0
        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
        : 'bg-red-500/10 text-red-300 border-red-500/30',
    },
  ];

  return (
    <section aria-label="System Metrics Overview" className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cardItems.map((card, index) => {
          const IconComponent = card.icon;
          return (
            <div
              key={index}
              className={`glass-panel relative overflow-hidden rounded-2xl p-5 border ${card.borderColor} bg-slate-900/60 backdrop-blur-xl transition-all duration-300 hover:translate-y-[-2px] hover:shadow-xl hover:shadow-indigo-500/5`}
            >
              {/* Top Accent Gradient Glow */}
              <div
                className={`absolute top-0 right-0 -mr-10 -mt-10 w-32 h-32 rounded-full bg-gradient-to-br ${card.accentColor} blur-2xl pointer-events-none opacity-60`}
              />

              {/* Card Header Row */}
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className={`p-2.5 rounded-xl bg-slate-800/80 border border-white/10 ${card.iconColor} shadow-inner`}>
                  <IconComponent className="w-5 h-5" />
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${card.badgeColor}`}>
                  {card.badge}
                </span>
              </div>

              {/* Card Body */}
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-100 tracking-tight mb-0.5">
                  {!isLoading ? card.value : '... loading'}
                </h3>
                <p className="text-xs font-semibold text-slate-300 mb-1">
                  {card.title}
                </p>
                <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                  <Activity className="w-3 h-3 text-slate-500" />
                  <span>{card.subtitle}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
