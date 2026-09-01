import React, { useEffect, useState } from 'react';
import { AlertOctagon, RotateCcw, Trash2, ShieldAlert, FileText, User, Clock, Terminal } from 'lucide-react';
import type { FailedAssetItem } from '../../types';
import { formatBytes } from '../../utils/_helperFunctions';
import { discardFailedAssets, getFailedAssets, retryFailedAssets } from '../../services/adminService';
import toast from 'react-hot-toast';


export const FailedAssetsTable: React.FC = () => {
  const [failedAssets, setFailedAssets] = useState<FailedAssetItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const data = await getFailedAssets();
      setFailedAssets(data);
    } catch (err) {
      console.error('Failed to load failed assets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function onRetry(id: string) {
    try {
      const res = await retryFailedAssets(id);
      if (res?.success) {
        toast.success('Asset re-queued successfully');
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to re-queue asset');
      console.error('Failed to retry asset:', err);
    }
  }


  async function onDiscard(id: string) {
    try {
      const res = await discardFailedAssets(id);
      if (res?.success) {
        toast.success('Asset discarded successfully');
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to discard asset');
      console.error('Failed to discard asset:', err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Failed Assets Audit & Triage
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                {failedAssets.length} Issues Pending Action
              </span>
            </h3>
            <p className="text-xs text-slate-400">Dead lettered and failed processing jobs requiring admin resolution</p>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
        {failedAssets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No Failed Assets</h4>
            <p className="text-xs text-slate-400 mt-1">All background processing jobs are operating normally.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/60 border-b border-white/10 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-center">Asset Datails</th>
                  <th className="py-3.5 px-4">Failed Timestamp</th>
                  <th className="py-3.5 px-4 text-center">Error Log Traceback</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                {failedAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors group">
                    {/* Column 1: Asset File & Uploader */}
                    <td className="py-4 px-4 align-top max-w-[240px]">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mt-0.5 shrink-0">
                          <AlertOctagon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-white truncate group-hover:text-red-200 transition-colors" title={asset.originalName}>
                            {asset.originalName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                            <span>{formatBytes(asset.size)}</span>
                            <span>•</span>
                            <span className="truncate">{asset.mimeType}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                            <User className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{asset.uploader.name}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Timestamp */}
                    <td className="py-4 px-4 align-top whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(asset.createdAt).toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Column 3: Error Message Log */}
                    <td className="py-4 px-4 align-top max-w-[380px]">
                      <div className="bg-slate-950/80 p-3 rounded-xl border border-red-500/20 text-red-300/90 font-mono text-[11px] leading-relaxed break-words relative group-hover:border-red-500/40 transition-colors">
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-red-400 font-bold uppercase tracking-wider">
                          <Terminal className="w-3 h-3" />
                          <span>Worker Execution Exception</span>
                        </div>
                        {asset.errorMessage}
                      </div>
                    </td>

                    {/* Column 4: Presentational Actions */}
                    <td className="py-4 px-4 align-top whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Retry Button (Stateless Presentational) */}
                        <button
                          type="button"
                          onClick={() => onRetry?.(asset.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-all font-semibold flex items-center gap-1.5 text-xs active:scale-95 shadow-sm"
                          title="Re-queue task to RabbitMQ worker queue"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retry Job
                        </button>

                        {/* Discard Button (Stateless Presentational) */}
                        <button
                          type="button"
                          onClick={() => onDiscard?.(asset.id)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all font-semibold flex items-center gap-1.5 text-xs active:scale-95 shadow-sm"
                          title="Permanently remove asset and MinIO storage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
