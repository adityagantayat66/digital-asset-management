import { api } from "./api";

export async function getAdminDashboardData() {
    const response = await api.get('/admin/dashboard-data');
    if (response.data.success) {
        return response.data.data;
    } else {
        throw new Error(response.data.message);
    }
}