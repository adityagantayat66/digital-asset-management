import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, Server, Activity, LogOut, Images } from 'lucide-react';
import { AdminMetricsGrid } from '../components/admin/AdminMetricsGrid';
import { WorkerHealthCard } from '../components/admin/WorkerHealthCard';
import { TopAssetCards } from '../components/admin/TopAssetCards';
import { FailedAssetsTable } from '../components/admin/FailedAssetsTable';
import { SystemLogsTable } from '../components/admin/SystemLogsTable';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const AdminDashboardPage: React.FC = () => {
  const { logout } = useAuth();
  const [isLoading] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const navigate = useNavigate();

  function navigateToGallery(): void {
    navigate('/dashboard');
  }

  function handleRefresh(): void {
    setRefreshKey((prev) => prev + 1);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500/30">
      {/* Admin Top Navigation Header */}
      <header className="border-b border-white/10 glass-panel sticky top-0 z-30 px-6 py-4 backdrop-blur-xl bg-slate-950/80">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Admin Branding & Status Badge */}
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 border border-white/10 shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">DAM Admin Console</h1>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider">
                  <Server className="w-3 h-3" />
                  <span>Cluster Active</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">Infrastructure & System Operations Hub</p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-2 rounded-xl border border-white/5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>System Health: <strong className="text-emerald-400 font-semibold">Optimal</strong></span>
            </div>
            <button
              type="button"
              onClick={navigateToGallery}
              className="py-2 px-3.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-300 hover:text-white font-medium text-xs transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Images className="w-3.5 h-3.5" />
              <span>View Gallery</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleRefresh}
              className="py-2 px-3.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-300 hover:text-white font-medium text-xs transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
              <span>Refresh</span>
            </button>
            {/* Logout */}
            <button
              onClick={logout}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-white/10 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Section 1: Top Metrics Grid */}
        <section aria-labelledby="metrics-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="metrics-heading" className="text-lg font-bold text-white tracking-tight">
                Infrastructure Overview
              </h2>
              <p className="text-xs text-slate-400">Real-time storage, assets, and worker heartbeat telemetry</p>
            </div>
          </div>

          {/* Embedded Component 1: Admin Metrics Grid */}
          <AdminMetricsGrid refreshKey={refreshKey} isLoading={isLoading} />
        </section>

        {/* Section 2: Worker Microservice Health & Queue Monitor */}
        <section aria-labelledby="worker-telemetry-heading">
          <WorkerHealthCard refreshKey={refreshKey} isLoading={isLoading} />
        </section>

        {/* Section 3: Top Assets (Downloads & Storage Footprint) */}
        <section aria-labelledby="top-assets-heading">
          <TopAssetCards refreshKey={refreshKey} />
        </section>

        {/* Section 4: System-Wide Failed Assets Audit Table */}
        <section aria-labelledby="failed-assets-heading">
          <FailedAssetsTable onActionSuccess={handleRefresh} />
        </section>

        {/* Section 5: System Observability Logs */}
        <section aria-labelledby="system-logs-heading">
          <SystemLogsTable />
        </section>
      </main>
    </div>
  );
};
