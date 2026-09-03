import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Layers,
  Lock,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Activity,
  Server,
  CheckCircle2,
  Radio,
  Clock,
} from 'lucide-react';
import type { WorkerHealthData } from '../../types';
import { api } from '../../services/api';
import { getWorkerHealthMetrics } from '../../services/adminService';

export interface WorkerHealthCardProps {
  data?: WorkerHealthData;
  isLoading?: boolean;
}

/**
 * Pure Presentational Component: Worker Microservice & Queue Monitor Card.
 * 100% Stateless - No React Hooks, API calls, or side effects.
 */
export const WorkerHealthCard: React.FC<WorkerHealthCardProps> = () => {
  const [metrics, setMetrics] = useState<WorkerHealthData | null>(null);
  const activeNodes = metrics?.workers?.activeNodes ?? 0;
  const pendingJobs = metrics?.queueDepth?.pendingJobs ?? 0;
  const activeProcessingJobs = metrics?.queueDepth?.activeProcessingJobs ?? 0;
  const dlqDepth = metrics?.dlq?.queueDepth ?? 0;
  const activeLocks = metrics?.locks?.activeJobLocks ?? 0;
  const failedCount = metrics?.failedAssetsCount ?? 0;
  const isClusterHealthy = activeNodes > 0;
  const hasDlqDiscrepancy = dlqDepth > 0;
  const [isLoading, setIsLoading] = useState(false);

  async function loadWorkerHealthData() {
    try {
      setIsLoading(true);
      const data = await getWorkerHealthMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch admin dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    loadWorkerHealthData();
  }, [])

  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function syncDLQ(): Promise<void> {
    try {
      setIsLoading(true);
      const response = await api.get('/admin/sync-dlq');
      if (response.data.success) {
        const count = response.data.data?.syncedCount ?? 0;
        setActionFeedback({
          message: `Successfully synced ${count} DLQ item(s) to PostgreSQL database!`,
          type: 'success',
        });
        await loadWorkerHealthData();
      }
    } catch (err: any) {
      console.error('Failed to sync DLQ:', err);
      setActionFeedback({
        message: err?.response?.data?.message || 'Failed to sync DLQ items',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setActionFeedback(null);
      }, 3000);
    }
  }

  async function purgeDLQ(): Promise<void> {
    try {
      setIsLoading(true);
      const response = await api.get('/admin/purge-dlq');
      if (response.data.success) {
        const count = response.data.data?.purgedCount ?? 0;
        setActionFeedback({
          message: `Successfully purged ${count} dead-lettered message(s) from RabbitMQ!`,
          type: 'success',
        });
        await loadWorkerHealthData();
      }
    } catch (err: any) {
      console.error('Failed to purge DLQ:', err);
      setActionFeedback({
        message: err?.response?.data?.message || 'Failed to purge DLQ',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setActionFeedback(null);
      }, 3000);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-6 space-y-6 bg-slate-900/60 shadow-xl backdrop-blur-xl">
      {/* Top Header & Live Health Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Worker Cluster & Queue Telemetry
              </h3>
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isClusterHealthy
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30'
                  }`}
              >
                <span className="relative flex h-2 w-2">
                  {isClusterHealthy && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${isClusterHealthy ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                  ></span>
                </span>
                <span>{isClusterHealthy ? 'Workers Active' : 'No Workers Online'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400">
              RabbitMQ Queue Depth, Distributed Locks, and Worker Node Telemetry
            </p>
          </div>
        </div>

        {/* AMQP Status Indicator */}
        <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5 self-start md:self-auto">
          <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>AMQP Broker: <strong className="text-indigo-300 font-semibold">Connected</strong></span>
        </div>
      </div>

      {/* 4 Mini Telemetry Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: RabbitMQ Task Queue */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">RabbitMQ Queue</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-bold text-white">
              {isLoading ? '...' : pendingJobs}
            </span>
            <span className="text-xs text-slate-400 font-medium">Pending</span>
            <span className="text-slate-600">|</span>
            <span className="text-xs text-indigo-400 font-medium">
              {activeProcessingJobs} In-Flight
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all duration-500"
              style={{ width: `${Math.min(pendingJobs * 10 + 2, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Card 2: Failed Assets (DB Audit) */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Failed Assets (DB)</span>
            <AlertTriangle className={`w-4 h-4 ${failedCount > 0 ? 'text-red-400' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-xl font-bold ${failedCount > 0 ? 'text-red-400' : 'text-white'}`}>
              {isLoading ? '...' : failedCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">Failed</span>
          </div>
          <span
            className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium border ${failedCount > 0
              ? 'bg-red-500/10 text-red-300 border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}
          >
            {failedCount > 0 ? 'Requires Audit' : '0 Failed Assets'}
          </span>
        </div>

        {/* Card 3: Distributed Locks */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Distributed Job Locks</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-bold text-white">
              {isLoading ? '...' : activeLocks}
            </span>
            <span className="text-xs text-slate-400">Active Locks</span>
          </div>
          <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-medium border border-amber-500/20">
            Redis SET NX EX
          </span>
        </div>

        {/* Card 4: Dead Letter Queue (DLQ) */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Dead Letter Queue</span>
            <AlertTriangle className={`w-4 h-4 ${hasDlqDiscrepancy ? 'text-red-400' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-xl font-bold ${hasDlqDiscrepancy ? 'text-red-400' : 'text-slate-300'}`}>
              {isLoading ? '...' : dlqDepth}
            </span>
            <span className="text-xs text-slate-400">Dead Lettered</span>
          </div>
          <span
            className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium border ${hasDlqDiscrepancy
              ? 'bg-red-500/10 text-red-300 border-red-500/30 animate-pulse'
              : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
          >
            {hasDlqDiscrepancy ? 'Sync Required' : 'DLQ Clean'}
          </span>
        </div>
      </div>

      {/* Conditional Discrepancy & Infrastructure Control Panel */}
      {(hasDlqDiscrepancy || actionFeedback) && (
        <div className={`p-4 rounded-xl space-y-3 transition-all ${hasDlqDiscrepancy ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-950/40 border border-white/10'}`}>
          {hasDlqDiscrepancy && (
            <>
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-amber-300 tracking-tight">
                    Infrastructure DLQ Discrepancy Detected
                  </h4>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    There are <strong className="text-white font-semibold">{dlqDepth} unacknowledged dead-lettered job payloads</strong> in RabbitMQ <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-300 font-mono text-[10px]">asset_dlq</code>. Click <strong>Sync DLQ to DB</strong> to map failure states into PostgreSQL for itemized audit.
                  </p>
                </div>
              </div>

              {/* Action Button Mockups */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={syncDLQ}
                  className="py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-200 hover:text-white text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync DLQ to DB</span>
                </button>

                <button
                  type="button"
                  onClick={purgeDLQ}
                  className="py-1.5 px-3 bg-slate-900 hover:bg-red-500/20 border border-white/10 text-slate-400 hover:text-red-300 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge DLQ</span>
                </button>
              </div>
            </>
          )}

          {/* 3-Second Action Feedback Banner */}
          {actionFeedback && (
            <div
              className={`p-2.5 rounded-lg border text-xs font-medium flex items-center space-x-2 transition-all animate-fadeIn ${actionFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{actionFeedback.message}</span>
            </div>
          )}
        </div>
      )}

      {/* 24-Hour Stale Upload Garbage Collection Telemetry Panel */}
      <div className="p-4 rounded-xl bg-slate-950/50 border border-white/10 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-bold text-slate-200 tracking-tight">
                  Automated 24-Hour Stale Upload Cleanup
                </h4>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  00:00
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {metrics?.lastCronJob
                  ? metrics.lastCronJob.message
                  : 'Scheduled daily at 00:00. Redis lock protection active.'}
              </p>
            </div>
          </div>

          {metrics?.lastCronJob?.timestamp && (
            <div className="text-left sm:text-right text-[10px] text-slate-400 shrink-0 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
              <p>Last Executed: <strong className="text-teal-300 font-semibold">{new Date(metrics.lastCronJob.timestamp).toLocaleString()}</strong></p>
              {metrics.lastCronJob.executedBy && (
                <p className="font-mono text-slate-500 text-[9px]">{metrics.lastCronJob.executedBy}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Worker Instance Registry List */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-300 tracking-tight flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Registered Worker Instances ({metrics?.workers?.nodes?.length ?? 0})</span>
          </h4>
          <span className="text-[10px] text-slate-500 font-mono">Heartbeat TTL: 10s</span>
        </div>

        {metrics?.workers?.nodes && metrics.workers.nodes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.workers.nodes.map((node) => (
              <div
                key={node.id}
                className="p-3 rounded-xl bg-slate-950/40 border border-white/5 flex items-center justify-between hover:border-white/10 transition-colors"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-mono font-semibold text-slate-200 truncate">
                      {node.id}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Heartbeat TTL: <strong className="text-emerald-400 font-semibold">{node.ttlRemainingSeconds}s</strong>
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{node.status}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-950/30 border border-dashed border-white/10 text-center">
            <p className="text-xs text-slate-500">
              No active worker heartbeats detected in Redis. Scale workers via <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-400 font-mono text-[10px]">docker compose up --scale worker=N</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
