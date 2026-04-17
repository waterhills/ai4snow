import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// 认证
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/v1/auth/login', data),
};

// 管理后台接口
export const adminApi = {
  getStats: () => api.get('/admin/dashboard/stats'),
  getUsers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/admin/users', { params }),
  updateCredits: (userId: string, credits: number, remark?: string) =>
    api.patch(`/admin/users/${userId}/credits`, { credits, remark }),
  getTasks: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/tasks', { params }),
  retryTask: (taskId: string) =>
    api.post(`/admin/tasks/${taskId}/retry`),
  getPayments: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/payments', { params }),
  manualRecharge: (userId: string, credits: number, remark?: string) =>
    api.post('/admin/payments/manual', { userId, credits, remark }),
};

export default api;
