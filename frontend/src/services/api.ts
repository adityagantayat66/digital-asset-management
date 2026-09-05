import axios from 'axios';

export const API_BASE_URL = 'http://localhost:8080/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
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

// Response Interceptor: Handle 401 Unauthorized globally and normalize error messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('dam_token');
      localStorage.removeItem('dam_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
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
