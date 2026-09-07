import React, { useState, useRef } from 'react';
import { Upload, X, Tag as TagIcon, CheckCircle2, AlertCircle, Loader2, FileVideo, FileImage, FileText, File as FileIcon, Zap } from 'lucide-react';
import { assetService } from '../services/assetService';
import { AssetStatus, type SSEProgressPayload } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Upload States
  const [step, setStep] = useState<'IDLE' | 'UPLOADING_S3' | 'PROCESSING_SSE' | 'COMPLETED' | 'ERROR'>('IDLE');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [sseProgress, setSseProgress] = useState<SSEProgressPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  if (!isOpen) return null;

  const handleAddTag = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const cleaned = tagInput.trim().replace(/^#/, '').toLowerCase();
      if (cleaned && !tags.includes(cleaned)) {
        setTags([...tags, cleaned]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartUpload = async () => {
    if (!file) return;

    setStep('UPLOADING_S3');
    setUploadPercent(0);
    setErrorMessage(null);
    setIsDuplicate(false);

    try {
      // 1. Request presigned URL from API Gateway
      const presignedData = await assetService.requestPresignedUrl(
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        tags
      );

      // 2. Direct binary PUT upload to MinIO S3 & extract ETag checksum
      const etag = await assetService.uploadToMinIO(presignedData.uploadUrl, file, (percent) => {
        setUploadPercent(percent);
      });

      // 3. Confirm upload completion to API Gateway (passing checksum for deduplication check)
      const completeRes = await assetService.completeUpload(presignedData.id, etag);

      if (completeRes.isDuplicate || completeRes.status === AssetStatus.COMPLETED) {
        setIsDuplicate(true);
        setStep('COMPLETED');
        setTimeout(() => {
          onUploadComplete();
          handleClose();
        }, 2200);
      } else {
        // 4. Connect to SSE Live Progress Stream for worker background processing
        setStep('PROCESSING_SSE');
        sseCleanupRef.current = assetService.connectSSEProgress(presignedData.id, (payload) => {
          setSseProgress(payload);
          if (payload.status === AssetStatus.COMPLETED) {
            setStep('COMPLETED');
            setTimeout(() => {
              onUploadComplete();
              handleClose();
            }, 1500);
          } else if (payload.status === AssetStatus.FAILED) {
            setStep('ERROR');
            setErrorMessage(payload.error || 'Video processing failed in background worker');
          }
        });
      }

    } catch (err: any) {
      console.error('Upload Error:', err);
      setStep('ERROR');
      const rawError = err.response?.data?.error;
      const msg = typeof rawError === 'string' ? rawError : rawError?.message || err.message || 'An unexpected error occurred during upload';
      setErrorMessage(msg);
    }
  };

  const handleClose = () => {
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }
    setFile(null);
    setTags([]);
    setTagInput('');
    setStep('IDLE');
    setUploadPercent(0);
    setSseProgress(null);
    setErrorMessage(null);
    setIsDuplicate(false);
    onClose();
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('video/')) return <FileVideo className="w-8 h-8 text-purple-400" />;
    if (mimeType.startsWith('image/')) return <FileImage className="w-8 h-8 text-indigo-400" />;
    if (mimeType.startsWith('audio/')) return <FileIcon className="w-8 h-8 text-emerald-400" />;
    return <FileText className="w-8 h-8 text-blue-400" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Upload Digital Asset</h3>
              <p className="text-xs text-slate-400">Direct S3 Object Storage & Background Transcoding</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: IDLE (File selection & Tagging) */}
        {step === 'IDLE' && (
          <div className="space-y-6">
            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : file
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-white/10 bg-slate-900/40 hover:border-indigo-500/50 hover:bg-slate-900/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
              />

              {file ? (
                <div className="flex items-center justify-center space-x-4">
                  {getFileIcon(file.type)}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-slate-400">{formatBytes(file.size)} • {file.type || 'Unknown Type'}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 border border-indigo-500/20">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-white">Click or drag & drop video or image file</p>
                  <p className="text-xs text-slate-400 mt-1">MP4, MOV, WEBM, PNG, JPG up to 500MB</p>
                </div>
              )}
            </div>

            {/* Tag Input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                Taxonomy Tags (Press Enter or comma to add)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <TagIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="e.g. video, 1080p, marketing"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30"
                    >
                      <span>#{t}</span>
                      <button onClick={() => handleRemoveTag(t)} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleStartUpload}
              disabled={!file}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Upload & Transcode Asset</span>
            </button>
          </div>
        )}

        {/* Step: UPLOADING_S3 & PROCESSING_SSE (Live Progress Stream) */}
        {(step === 'UPLOADING_S3' || step === 'PROCESSING_SSE') && (
          <div className="space-y-6 py-6 text-center">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {step === 'UPLOADING_S3' ? `${uploadPercent}%` : `${sseProgress?.progress || 0}%`}
              </div>
            </div>

            <div>
              <h4 className="text-base font-bold text-white">
                {step === 'UPLOADING_S3' ? 'Uploading Direct to MinIO S3...' : 'FFmpeg Background Processing...'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {step === 'UPLOADING_S3'
                  ? `Streaming ${file?.name} directly to object storage`
                  : sseProgress?.stage === 'transcoding'
                  ? `Transcoding resolution & extracting thumbnail (${sseProgress.progress}%)`
                  : 'Queued in RabbitMQ microservice worker...'}
              </p>
            </div>

            {/* Animated Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-white/10 p-0.5">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{
                  width: `${step === 'UPLOADING_S3' ? uploadPercent : sseProgress?.progress || 0}%`,
                }}
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400 flex items-center justify-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span>Real-Time Server-Sent Events (SSE) Active</span>
            </div>
          </div>
        )}

        {/* Step: COMPLETED */}
        {step === 'COMPLETED' && (
          <div className="py-8 text-center space-y-4">
            {isDuplicate ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20 animate-pulse">
                  <Zap className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-bold text-white">Identical Asset Detected!</h4>
                <p className="text-sm font-semibold text-amber-300">The same video/image already exists in storage. Processed instantly!</p>
                <p className="text-xs text-slate-400">Worker transcoding skipped & media reused from previous upload.</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-bold text-white">Upload & Transcode Complete!</h4>
                <p className="text-xs text-slate-400">Asset is processed and live in your gallery</p>
              </>
            )}
          </div>
        )}

        {/* Step: ERROR */}
        {step === 'ERROR' && (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">Upload Processing Failed</h4>
            <p className="text-xs text-red-400 max-w-sm mx-auto">{errorMessage}</p>
            <button
              onClick={() => setStep('IDLE')}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
