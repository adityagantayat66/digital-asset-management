import { api } from './api';
import { AssetStatus, type Asset, type AssetsListResponse, type PresignedUrlResponse, type SSEProgressPayload } from '../types';

export interface ListAssetsParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  tag?: string;
}

export const assetService = {
  /**
   * Fetch paginated & filtered list of assets (Redis RAM cached on backend)
   */
  async listAssets(params: ListAssetsParams = {}): Promise<AssetsListResponse> {
    const res = await api.get('/assets', { params });
    return (res.data as any).data || res.data;
  },

  /**
   * Fetch single asset metadata by ID
   */
  async getAssetById(id: string): Promise<Asset> {
    const res = await api.get(`/assets/${id}`);
    return (res.data as any).data || res.data;
  },

  /**
   * Step 1: Request presigned S3 PUT URL for uploading raw file directly to MinIO
   */
  async requestPresignedUrl(filename: string, mimeType: string, size: number, tags: string[]): Promise<PresignedUrlResponse> {
    const res = await api.post('/assets/presigned-url', {
      filename,
      mimeType,
      size,
      tags,
    });
    return (res.data as any).data || res.data;
  },

  /**
   * Step 2: Directly upload raw file bytes to MinIO S3 Presigned URL
   */
  async uploadToMinIO(uploadUrl: string, file: File, onProgress?: (percent: number) => void): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const rawEtag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
          const etag = rawEtag ? rawEtag.replace(/"/g, '') : undefined;
          resolve(etag);
        } else {
          reject(new Error(`MinIO upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during MinIO upload'));
      xhr.send(file);
    });
  },

  /**
   * Step 3: Confirm upload completion and publish job to RabbitMQ queue
   */
  async completeUpload(assetId: string, checksum?: string): Promise<{ message: string; status: AssetStatus; isDuplicate?: boolean }> {
    const res = await api.post('/assets/complete-upload', { assetId, checksum });
    return (res.data as any).data || res.data;
  },

  /**
   * Step 4: Subscribe to Server-Sent Events (SSE) progress stream for real-time transcode status
   */
  connectSSEProgress(assetId: string, onEvent: (payload: SSEProgressPayload) => void): () => void {
    const token = localStorage.getItem('dam_token') || '';
    const url = `/api/assets/${assetId}/progress/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const payload: SSEProgressPayload = JSON.parse(event.data);
        onEvent(payload);
        if (payload.status === AssetStatus.COMPLETED || payload.status === AssetStatus.FAILED) {
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE progress payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Progress stream error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  },

  /**
   * Request S3 presigned GET URL and trigger browser download
   */
  async downloadAsset(asset: Asset): Promise<void> {
    const res = await api.get(`/assets/${asset.id}/download`);
    const payload = (res.data as any).data || res.data;
    const downloadUrl = payload.downloadUrl;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = asset.originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
