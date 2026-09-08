import React, { useEffect, useState } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Code,
  Terminal,
  Clock,
  Layers,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getSystemLogs } from '../../services/adminService';
import toast from 'react-hot-toast';

export interface SystemLogRecord {
  id: string;
  timestamp: string;
  level: string;
  origin: string;
  functionName: string;
  message: string;
  code?: string | null;
  statusCode?: number | null;
  correlationId?: string | null;
  method?: string | null;
  url?: string | null;
  userId?: string | null;
  ip?: string | null;
  details?: any;
  stack?: string | null;
  createdAt: string;
}

export const SystemLogsTable: React.FC = () => {
  const [logs, setLogs] = useState<SystemLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [originFilter, setOriginFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const res = await getSystemLogs({
        page,
        limit: 15,
        level: levelFilter || undefined,
        origin: originFilter || undefined,
        search: search.trim() || undefined,
      });

      if (res?.logs) {
        setLogs(res.logs);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalCount(res.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch system logs:', err);
      toast.error('Failed to load system logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, levelFilter, originFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Correlation ID copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">System Observability Logs</h3>
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time error events, correlation traces, and cross-service diagnostics (Auto-purged after 10 days)
          </p>
        </div>

        <button
          onClick={() => fetchLogs()}
          disabled={isLoading}
          className="self-start md:self-auto py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-xl border border-white/5">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by message, function, correlation ID, URL..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 text-slate-200 placeholder-slate-500 text-xs rounded-xl pl-10 pr-4 py-2.5 transition-all outline-none"
          />
        </form>

        {/* Level Filters */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 lg:pb-0">
          <button
            type="button"
            onClick={() => { setLevelFilter(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              levelFilter === ''
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Levels
          </button>
          <button
            type="button"
            onClick={() => { setLevelFilter('ERROR'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              levelFilter === 'ERROR'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            ERROR
          </button>
          <button
            type="button"
            onClick={() => { setLevelFilter('CRITICAL'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              levelFilter === 'CRITICAL'
                ? 'bg-red-700 text-white shadow-lg shadow-red-700/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            CRITICAL
          </button>
          <button
            type="button"
            onClick={() => { setLevelFilter('WARN'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              levelFilter === 'WARN'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            WARN
          </button>
        </div>

        {/* Origin Select */}
        <select
          value={originFilter}
          onChange={(e) => { setOriginFilter(e.target.value); setPage(1); }}
          className="bg-slate-900 text-slate-300 text-xs border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-purple-500 transition-all cursor-pointer"
        >
          <option value="">All Origins</option>
          <option value="API_GATEWAY">API Gateway</option>
          <option value="WORKER">Worker Node</option>
          <option value="SYSTEM">System</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/40">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-white/5">
            <tr>
              <th className="py-3 px-4">Level / Origin</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Function / Endpoint</th>
              <th className="py-3 px-4">Error Message</th>
              <th className="py-3 px-4">Correlation ID</th>
              <th className="py-3 px-4 text-right">Trace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex justify-center items-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Fetching live logs...</span>
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center space-y-2">
                    <Check className="w-6 h-6 text-emerald-400" />
                    <span className="font-semibold text-slate-300">No Error Logs Found</span>
                    <span className="text-xs text-slate-500">No recorded system errors matching criteria.</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const levelColor =
                  log.level === 'CRITICAL'
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : log.level === 'WARN'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30';

                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-900/50 transition-colors">
                      {/* Level & Origin */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${levelColor}`}
                          >
                            {log.level}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                            {log.origin}
                          </span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{new Date(log.timestamp || log.createdAt).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Function / Endpoint */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="text-purple-400 font-mono text-[11px] flex items-center space-x-1">
                            <Terminal className="w-3 h-3 text-slate-500" />
                            <span>{log.functionName}</span>
                          </div>
                          {log.method && log.url && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              {log.method} {log.url}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Error Message */}
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-slate-200 truncate" title={log.message}>
                          {log.message}
                        </div>
                        {log.code && (
                          <span className="inline-block mt-0.5 text-[10px] text-indigo-400 font-mono bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40">
                            Code: {log.code}
                          </span>
                        )}
                      </td>

                      {/* Correlation ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.correlationId ? (
                          <button
                            onClick={() => handleCopy(log.correlationId!, log.id)}
                            className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[10px] font-mono rounded-lg transition-colors cursor-pointer group"
                            title="Click to copy Correlation ID"
                          >
                            <Layers className="w-3 h-3 text-purple-400" />
                            <span className="truncate max-w-[100px]">{log.correlationId}</span>
                            {copiedId === log.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Trace Toggle */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-800/40 rounded-lg text-[11px] font-medium transition-colors inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <Code className="w-3 h-3" />
                          <span>{isExpanded ? 'Hide' : 'Details'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Stack Trace & Context Drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-950/80">
                        <td colSpan={6} className="p-4 border-b border-white/5 space-y-4">
                          {/* Request Context */}
                          {(log.method || log.url || log.userId || log.ip) && (
                            <div className="bg-slate-900 p-3 rounded-xl border border-white/5 space-y-2">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Request Context
                              </span>
                              <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-300">
                                {log.method && <div><span className="text-slate-500">Method:</span> {log.method}</div>}
                                {log.url && <div><span className="text-slate-500">URL:</span> {log.url}</div>}
                                {log.userId && <div><span className="text-slate-500">User ID:</span> {log.userId}</div>}
                                {log.ip && <div><span className="text-slate-500">IP:</span> {log.ip}</div>}
                              </div>
                            </div>
                          )}

                          {/* Details Payload */}
                          {log.details && (
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Custom Context Details
                              </span>
                              <pre className="bg-slate-900 p-3 rounded-xl border border-white/5 text-slate-300 text-xs font-mono overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Stack Trace */}
                          {log.stack ? (
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                                Exception Stack Trace
                              </span>
                              <pre className="bg-slate-900/90 p-4 rounded-xl border border-rose-900/40 text-rose-300/90 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                {log.stack}
                              </pre>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic">No stack trace captured for this log event.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
          <div>
            Page <strong className="text-slate-200">{page}</strong> of <strong className="text-slate-200">{totalPages}</strong>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
