import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Bearer Token if present in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dam_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle 401 Unauthorized with Automatic Silent Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.code;

    // Auto-Refresh: If access token expired and request hasn't been retried yet
    if (
      error.response?.status === 401 &&
      errorCode === 'TOKEN_EXPIRED' &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        // Call refresh endpoint to rotate refresh token & get fresh access token cookie
        await api.post('/auth/refresh');
        // Retry the original request transparently
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token is also expired or invalid -> logout & redirect to login
        localStorage.removeItem('dam_user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // Standard 401 handling for invalid credentials / unauthenticated access
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('dam_user');
      window.location.href = '/login';
    }

    if (error.response?.data) {
      const serverError = error.response.data.error;
      const serverMessage = error.response.data.message;

      if (typeof serverError === 'string') {
        error.message = serverError;
      } else if (serverError && typeof serverError === 'object' && serverError.message) {
        error.message = serverError.message;
      } else if (serverMessage && typeof serverMessage === 'string') {
        error.message = serverMessage;
      }
    }

    return Promise.reject(error);
  }
);
