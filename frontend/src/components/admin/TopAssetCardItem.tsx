import React from 'react';
import { FileVideo, FileImage } from 'lucide-react';
import type { TopAssetItem } from '../../types';

export interface MetricDetail {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlightClass?: string;
  iconBgClass?: string;
}

export interface TopAssetCardItemProps {
  item: TopAssetItem;
  rankBadgeLabel: string;
  rankBadgeStyle: string;
  accentGlowClass: string;
  hoverBorderClass: string;
  hoverTextClass: string;
  primaryMetric: MetricDetail;
  secondaryMetric: MetricDetail;
  avatarGradientClass?: string;
}

export const TopAssetCardItem: React.FC<TopAssetCardItemProps> = ({
  item,
  rankBadgeLabel,
  rankBadgeStyle,
  accentGlowClass,
  hoverBorderClass,
  hoverTextClass,
  primaryMetric,
  secondaryMetric,
  avatarGradientClass = 'from-purple-500 to-indigo-600',
}) => {
  return (
    <div
      className={`glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden group transition-all duration-300 hover:shadow-lg ${hoverBorderClass}`}
    >
      {/* Background Ambient Glow */}
      <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl transition-all ${accentGlowClass}`} />

      {/* Header Row: Rank Badge & File Type */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className={`px-2.5 py-1 text-xs font-bold font-mono rounded-lg border ${rankBadgeStyle}`}>
          {rankBadgeLabel}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-white/5">
          {item.mimeType.startsWith('video/') ? (
            <FileVideo className="w-3.5 h-3.5 text-purple-400" />
          ) : (
            <FileImage className="w-3.5 h-3.5 text-cyan-400" />
          )}
          {item.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
        </span>
      </div>

      {/* Asset Title */}
      <h4 className={`text-sm font-semibold text-white truncate mb-3 relative z-10 transition-colors ${hoverTextClass}`}>
        {item.originalName}
      </h4>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-2 mb-4 relative z-10">
        {/* Primary Metric */}
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-white/5 flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${primaryMetric.iconBgClass || 'bg-slate-800 text-slate-300'}`}>
            {primaryMetric.icon}
          </div>
          <div className="truncate">
            <p className="text-[10px] text-slate-400 font-medium truncate">{primaryMetric.label}</p>
            <p className={`text-xs font-bold font-mono truncate ${primaryMetric.highlightClass || 'text-slate-200'}`}>
              {primaryMetric.value}
            </p>
          </div>
        </div>

        {/* Secondary Metric */}
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-white/5 flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${secondaryMetric.iconBgClass || 'bg-slate-800 text-slate-400'}`}>
            {secondaryMetric.icon}
          </div>
          <div className="truncate">
            <p className="text-[10px] text-slate-400 font-medium truncate">{secondaryMetric.label}</p>
            <p className={`text-xs font-bold font-mono truncate ${secondaryMetric.highlightClass || 'text-slate-300'}`}>
              {secondaryMetric.value}
            </p>
          </div>
        </div>
      </div>

      {/* Footer: Uploader Attribution */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/5 relative z-10">
        <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${avatarGradientClass} flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0`}>
          {item.uploader.name.charAt(0)}
        </div>
        <div className="truncate">
          <p className="text-[11px] font-medium text-slate-300 truncate">{item.uploader.name}</p>
          <p className="text-[9px] text-slate-500 truncate">{item.uploader.email}</p>
        </div>
      </div>
    </div>
  );
};
