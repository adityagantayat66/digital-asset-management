import type { AxiosResponse } from "axios";

export const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export function handleAndForwardAPIResponse(response: AxiosResponse) {
    if (response.data?.success) {
        return response.data.data;
    } else {
        const errMsg = response.data?.error?.message || response.data?.message || 'Request failed';
        throw new Error(errMsg);
    }
}