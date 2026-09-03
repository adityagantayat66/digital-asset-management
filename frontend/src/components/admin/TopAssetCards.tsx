import React, { useEffect, useState } from 'react';
import { Download, HardDrive, TrendingUp, Layers } from 'lucide-react';
import type { TopAssetItem } from '../../types';
import { formatBytes } from '../../utils/_helperFunctions';
import { TopAssetCardItem } from './TopAssetCardItem';
import { getDownloadAndMemoryStats } from '../../services/adminService';


export interface TopAssetCardsProps {
  refreshKey?: number;
}

export const TopAssetCards: React.FC<TopAssetCardsProps> = ({ refreshKey }) => {
  const [topStats, setTopStats] = useState<{
    downloadStats: TopAssetItem[];
    storageStats: TopAssetItem[];
  }>({
    downloadStats: [],
    storageStats: []
  });
  const topDownloads = topStats.downloadStats;
  const topStorage = topStats.storageStats;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await getDownloadAndMemoryStats();
        setTopStats(data);
      } catch (err) {
        console.error('Failed to load top asset stats:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [refreshKey]);
  return (
    <div className="space-y-8">
      {/* Subsection 1: Top 3 Downloaded Assets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Top Downloaded Assets
                {isLoading ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-slate-800 text-slate-400 animate-pulse">
                    Loading...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Redis Leaderboard
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Most requested digital media assets across users</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topDownloads.slice(0, 3).map((item, idx) => {
            const rankStyles = [
              { label: '#1 Top', style: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
              { label: '#2 Rank', style: 'bg-slate-300/20 text-slate-200 border-slate-300/40' },
              { label: '#3 Rank', style: 'bg-orange-600/20 text-orange-300 border-orange-600/40' },
            ];
            const rank = rankStyles[idx] || rankStyles[2];

            return (
              <TopAssetCardItem
                key={item.id}
                item={item}
                rankBadgeLabel={rank.label}
                rankBadgeStyle={rank.style}
                accentGlowClass="bg-amber-500/10 group-hover:bg-amber-500/20"
                hoverBorderClass="hover:border-amber-500/40 hover:shadow-amber-500/5"
                hoverTextClass="group-hover:text-amber-200"
                primaryMetric={{
                  label: 'Downloads',
                  value: item.downloadCount.toLocaleString(),
                  icon: <Download className="w-4 h-4" />,
                  iconBgClass: 'bg-amber-500/10 text-amber-400',
                  highlightClass: 'text-amber-300',
                }}
                secondaryMetric={{
                  label: 'Size',
                  value: formatBytes(item.size),
                  icon: <HardDrive className="w-4 h-4" />,
                  iconBgClass: 'bg-slate-800 text-slate-300',
                  highlightClass: 'text-slate-200',
                }}
                avatarGradientClass="from-amber-500 to-purple-600"
              />
            );
          })}
        </div>
      </div>

      {/* Subsection 2: Top 3 Largest Storage Assets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Top Storage Heavyweight Assets
                {isLoading ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-slate-800 text-slate-400 animate-pulse">
                    Loading...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    MinIO Storage Footprint
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Largest media files consuming object storage capacity</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topStorage.slice(0, 3).map((item, idx) => {
            const rankLabels = ['#1 Max Storage', '#2 Large', '#3 Heavy'];

            return (
              <TopAssetCardItem
                key={item.id}
                item={item}
                rankBadgeLabel={rankLabels[idx] || `#${idx + 1}`}
                rankBadgeStyle="bg-purple-500/20 text-purple-300 border-purple-500/40"
                accentGlowClass="bg-purple-500/10 group-hover:bg-purple-500/20"
                hoverBorderClass="hover:border-purple-500/40 hover:shadow-purple-500/5"
                hoverTextClass="group-hover:text-purple-200"
                primaryMetric={{
                  label: 'Storage Size',
                  value: formatBytes(item.size),
                  icon: <HardDrive className="w-4 h-4" />,
                  iconBgClass: 'bg-purple-500/10 text-purple-400',
                  highlightClass: 'text-purple-300',
                }}
                secondaryMetric={{
                  label: 'Downloads',
                  value: item.downloadCount.toLocaleString(),
                  icon: <Download className="w-4 h-4" />,
                  iconBgClass: 'bg-slate-800 text-slate-400',
                  highlightClass: 'text-slate-300',
                }}
                avatarGradientClass="from-purple-500 to-indigo-600"
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
