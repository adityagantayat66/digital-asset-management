import React from 'react';
import { Film, Image as ImageIcon, FileText, Download, Play, HardDrive, CheckCircle2, Clock, AlertTriangle, Eye } from 'lucide-react';
import type { Asset } from '../types';
import { formatBytes } from '../utils/_helperFunctions';

interface AssetCardProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ asset, onSelect, onDownload }) => {
  const isVideo = asset.mimeType.startsWith('video/');
  const isImage = asset.mimeType.startsWith('image/');

  const getStatusBadge = () => {
    switch (asset.status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready</span>
          </span>
        );
      case 'PROCESSING':
      case 'QUEUED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider animate-pulse">
            <Clock className="w-3 h-3" />
            <span>Processing</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onClick={() => onSelect(asset)}
      className="glass-card rounded-2xl border border-white/10 overflow-hidden group hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between"
    >
      {/* Media Thumbnail Container */}
      <div className="relative w-full h-44 bg-slate-900 overflow-hidden flex items-center justify-center">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.originalName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : isVideo ? (
          <div className="flex flex-col items-center justify-center text-purple-400">
            <Film className="w-12 h-12 mb-1" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Video Asset</span>
          </div>
        ) : isImage ? (
          <div className="flex flex-col items-center justify-center text-indigo-400">
            <ImageIcon className="w-12 h-12 mb-1" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Image Asset</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-blue-400">
            <FileText className="w-12 h-12 mb-1" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Document</span>
          </div>
        )}

        {/* Hover Overlay Button */}
        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
            {isVideo
              ? <Play className="w-5 h-5 fill-current ml-0.5" />
              : <Eye className='w-5 h-5 ml-0.5' />}
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          {getStatusBadge()}

          {/* Video Resolution Badges */}
          {isVideo ? (
            <div className="flex space-x-1">
              {asset.transcoded1080pUrl && (
                <span className="px-1.5 py-0.5 rounded bg-purple-600/90 text-white text-[9px] font-extrabold uppercase shadow-sm">
                  1080p
                </span>
              )}
              {asset.transcoded720pUrl && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-600/90 text-white text-[9px] font-extrabold uppercase shadow-sm">
                  720p
                </span>
              )}
              {asset.transcodedSdUrl && (
                <span className="px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[9px] font-extrabold uppercase shadow-sm">
                  SD
                </span>
              )}
            </div>
          ) : (
            <div className="flex space-x-1">
              <span className="px-1.5 py-0.5 rounded bg-orange-600/90 text-white text-[9px] font-extrabold uppercase shadow-sm">
                Image
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="truncate pr-2">
            <h4 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
              {asset.originalName}
            </h4>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
              <span className="flex items-center space-x-1">
                <HardDrive className="w-3 h-3 text-slate-500" />
                <span>{formatBytes(asset.size)}</span>
              </span>
              <span>•</span>
              <span className="uppercase text-[10px] font-medium text-slate-400">
                {asset.mimeType.split('/')[1] || asset.mimeType}
              </span>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(asset);
            }}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Download Master File"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Tags */}
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {asset.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                #{tag}
              </span>
            ))}
            {asset.tags.length > 3 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                +{asset.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
