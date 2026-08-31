import React, { useState } from 'react';
import { X, Download, Tag, Calendar, User, HardDrive, Film, Image as ImageIcon, FileText, Check } from 'lucide-react';
import type { Asset } from '../types';
import { assetService } from '../services/assetService';
import { formatBytes } from '../utils/_helperFunctions';

interface AssetDetailModalProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({ asset, isOpen, onClose }) => {
  const [selectedQuality, setSelectedQuality] = useState<'1080p' | '720p' | 'sd'>('sd');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !asset) return null;

  const isVideo = asset.mimeType.startsWith('video/');
  const isImage = asset.mimeType.startsWith('image/');

  // Determine available video playback URL
  const getActiveVideoUrl = () => {
    if (selectedQuality === '1080p' && asset.transcoded1080pUrl) return asset.transcoded1080pUrl;
    if (selectedQuality === '720p' && asset.transcoded720pUrl) return asset.transcoded720pUrl;
    if (selectedQuality === 'sd' && asset.transcodedSdUrl) return asset.transcodedSdUrl;
    return asset.transcodedSdUrl || asset.transcoded720pUrl || asset.transcoded1080pUrl || '';
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await assetService.downloadAsset(asset);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = () => {
    const url = getActiveVideoUrl() || asset.thumbnailUrl || window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="glass-panel w-full max-w-4xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center space-x-3 truncate">
            {isVideo ? (
              <Film className="w-6 h-6 text-purple-400 shrink-0" />
            ) : isImage ? (
              <ImageIcon className="w-6 h-6 text-indigo-400 shrink-0" />
            ) : (
              <FileText className="w-6 h-6 text-blue-400 shrink-0" />
            )}
            <div className="truncate">
              <h3 className="text-lg font-bold text-white truncate">{asset.originalName}</h3>
              <p className="text-xs text-slate-400">{asset.mimeType} • {formatBytes(asset.size)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto pr-1">
          {/* Media Player / Preview Area (2/3 width) */}
          <div className="lg:col-span-2 flex flex-col space-y-4">
            <div className="w-full bg-slate-900 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center min-h-[280px] max-h-[420px] relative">
              {isVideo ? (
                <video
                  key={getActiveVideoUrl()}
                  controls
                  autoPlay
                  poster={asset.thumbnailUrl || undefined}
                  src={getActiveVideoUrl()}
                  className="w-full max-h-[420px] object-contain rounded-2xl"
                />
              ) : isImage ? (
                <img
                  src={asset.thumbnailUrl || getActiveVideoUrl()}
                  alt={asset.originalName}
                  className="w-full max-h-[420px] object-contain rounded-2xl"
                />
              ) : (
                <div className="flex flex-col items-center py-12 text-slate-500">
                  <FileText className="w-16 h-16 mb-2" />
                  <p className="text-sm">Document Preview Not Available</p>
                </div>
              )}
            </div>

            {/* Resolution Quality Switcher Toolbar (For Videos) */}
            {isVideo && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5 text-xs">
                <span className="text-slate-400 font-medium">Transcoded Quality:</span>
                <div className="flex items-center space-x-2">
                  {asset.transcoded1080pUrl && (
                    <button
                      onClick={() => setSelectedQuality('1080p')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedQuality === '1080p'
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      1080p Full HD
                    </button>
                  )}
                  {asset.transcoded720pUrl && (
                    <button
                      onClick={() => setSelectedQuality('720p')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedQuality === '720p'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      720p HD
                    </button>
                  )}
                  {asset.transcodedSdUrl && (
                    <button
                      onClick={() => setSelectedQuality('sd')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedQuality === 'sd'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      SD Standard
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Metadata Inspector Side Panel (1/3 width) */}
          <div className="flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Metadata</h4>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-slate-400 flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    <span>File Size</span>
                  </span>
                  <span className="font-semibold text-white">{formatBytes(asset.size)}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-slate-400 flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span>Upload Date</span>
                  </span>
                  <span className="font-semibold text-white">{new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>

                {asset.uploader && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5">
                    <span className="text-slate-400 flex items-center space-x-2">
                      <User className="w-4 h-4 text-emerald-400" />
                      <span>Contributor</span>
                    </span>
                    <span className="font-semibold text-white">{asset.uploader.name}</span>
                  </div>
                )}
              </div>

              {/* Tags Section */}
              {asset.tags && asset.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Taxonomy Tags</span>
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {asset.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] border border-indigo-500/20"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-4 border-t border-white/10">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloading ? 'Generating Link...' : 'Download Master Asset'}</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium rounded-xl border border-white/10 flex items-center justify-center space-x-2 text-xs transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Film className="w-4 h-4" />}
                <span>{copiedLink ? 'Stream URL Copied!' : 'Copy Media Stream Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
