import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import type { Asset } from '../types';
import { AssetCard } from '../components/AssetCard';
import { UploadModal } from '../components/UploadModal';
import { AssetDetailModal } from '../components/AssetDetailModal';
import { Search, Upload, LogOut, User as UserIcon, Database, Film, Image as ImageIcon, FileText, Layers, RefreshCw, FolderOpen, Layers2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // State Management
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Timer Ref for debouncing
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalAssets, setTotalAssets] = useState<number>(0);

  const fetchAssets = useCallback(async (queryToSearch = searchQuery) => {
    setIsLoading(true);
    try {
      const typeFilter = selectedType === 'ALL' ? undefined : selectedType;
      const data = await assetService.listAssets({
        page,
        limit: 12,
        search: queryToSearch.trim() || undefined,
        type: typeFilter,
      });

      setAssets(data.assets || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalAssets(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch assets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, selectedType]);

  // DEBOUNCING search: Cancels active timer & schedules API call after 500ms
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      fetchAssets(searchQuery);
    }, 500);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, page, selectedType, fetchAssets]);

  const handleAssetSelect = async (asset: Asset) => {
    try {
      const fullAssetDetails = await assetService.getAssetById(asset.id);
      setSelectedAsset(fullAssetDetails);
      setIsDetailModalOpen(true);
    } catch (err) {
      console.error('Failed to load asset details:', err);
      setSelectedAsset(asset);
      setIsDetailModalOpen(true);
    }
  };

  const handleDownload = async (asset: Asset) => {
    try {
      await assetService.downloadAsset(asset);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  function navigateToAdminConsole(): void {
    navigate('/adminDashboard');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header Navigation */}
      <header className="border-b border-white/10 glass-panel sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10 shrink-0">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">DAM Platform</h1>
              <p className="text-xs text-slate-400">Enterprise Asset Hub</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets by name, tag, or MIME type..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs transition-all"
            />
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/25 flex items-center space-x-2 text-xs transition-all cursor-pointer shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Asset</span>
            </button>

            {/* User Badge */}
            {user?.role && user.role === 'ADMIN' && (
              <button
                onClick={navigateToAdminConsole}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 shrink-0 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Layers2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-white hidden lg:inline">Admin Console</span>
              </button>
            )}

            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <UserIcon className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white hidden lg:inline">{user?.name}</span>
            </div>

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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Category Tabs & Refresh Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => { setSelectedType('ALL'); setPage(1); }}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${selectedType === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Assets</span>
            </button>

            <button
              onClick={() => { setSelectedType('video'); setPage(1); }}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${selectedType === 'video'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
                }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Videos</span>
            </button>

            <button
              onClick={() => { setSelectedType('image'); setPage(1); }}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${selectedType === 'image'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
                }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Images</span>
            </button>

            <button
              onClick={() => { setSelectedType('document'); setPage(1); }}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${selectedType === 'document'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
                }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Documents</span>
            </button>
          </div>

          <div className="flex items-center justify-between w-full sm:w-auto space-x-4">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-white">{assets.length}</strong> of{' '}
              <strong className="text-white">{totalAssets}</strong> assets
            </span>

            <button
              onClick={() => fetchAssets()}
              className="p-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
              title="Refresh Gallery"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Gallery Grid State */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="glass-card rounded-2xl p-4 space-y-3 animate-pulse border border-white/5">
                <div className="w-full h-44 bg-slate-900/80 rounded-xl" />
                <div className="h-4 bg-slate-900/80 rounded w-3/4" />
                <div className="h-3 bg-slate-900/80 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : assets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSelect={handleAssetSelect}
                onDownload={handleDownload}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel py-16 px-6 rounded-3xl border border-white/10 text-center max-w-md mx-auto my-12">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-4">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">No Digital Assets Found</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6">
              {searchQuery
                ? `No assets match your search term "${searchQuery}".`
                : 'Your digital asset repository is empty. Upload your first media asset!'}
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="py-2.5 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl text-xs transition-all shadow-lg shadow-indigo-500/25 cursor-pointer"
            >
              Upload Asset Now
            </button>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center space-x-2 pt-6 border-t border-white/10">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 text-xs font-medium border border-white/10 cursor-pointer"
            >
              Previous
            </button>

            <span className="text-xs text-slate-400 px-4">
              Page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>
            </span>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 text-xs font-medium border border-white/10 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Upload Modal (Direct S3 + SSE Progress Bar) */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadComplete={() => fetchAssets()}
      />

      {/* Asset Detail & Video Player Modal */}
      <AssetDetailModal
        asset={selectedAsset}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedAsset(null);
        }}
      />
    </div>
  );
};
