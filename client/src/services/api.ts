import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截：自动附加 JWT Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：统一处理 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ===== 认证 =====
export const authApi = {
  register: (data: { email: string; password: string; name?: string }) =>
    api.post('/v1/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/v1/auth/login', data),
};

// ===== 用户 =====
export const userApi = {
  getProfile: () => api.get('/v1/user/profile'),
};

// ===== 任务 =====
export const taskApi = {
  upload: (file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/v1/tasks', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
  },
  list: (page = 1, limit = 10) =>
    api.get(`/v1/tasks?page=${page}&limit=${limit}`),
  get: (id: string) => api.get(`/v1/tasks/${id}`),
  getStatus: (id: string) => api.get(`/v1/tasks/${id}/status`),
};

export default api;
