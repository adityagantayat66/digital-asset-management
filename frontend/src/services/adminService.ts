import { handleAndForwardAPIResponse } from "../utils/_helperFunctions";
import { api } from "./api";

export async function getWorkerHealthMetrics() {
    const response = await api.get('/admin/health-metrics');
    return handleAndForwardAPIResponse(response);
}

export async function getInfraMetrics() {
    const response = await api.get('/admin/infra-metrics');
    return handleAndForwardAPIResponse(response);
}
export async function getDownloadAndMemoryStats() {
    const response = await api.get('/admin/download-memory-stats');
    return handleAndForwardAPIResponse(response);
}

export async function getFailedAssets() {
    const response = await api.get('/admin/failed-assets');
    return handleAndForwardAPIResponse(response);
}

export async function retryFailedAssets(assetId: string) {
    const response = await api.post(`/admin/retry-failed-assets/${assetId}`);
    return handleAndForwardAPIResponse(response);
}

export async function discardFailedAssets(assetId: string) {
    const response = await api.delete(`/admin/discard-failed-assets/${assetId}`);
    return handleAndForwardAPIResponse(response);
}

export async function getSystemLogs(params?: {
    page?: number;
    limit?: number;
    level?: string;
    origin?: string;
    search?: string;
}) {
    const response = await api.get('/admin/system-logs', { params });
    return handleAndForwardAPIResponse(response);
}