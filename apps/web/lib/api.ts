import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  // Cookies (access + refresh) flow automatically — no manual Authorization header.
  withCredentials: true,
});

// ─────────────────────────────────────────────────────────────
// Refresh-on-401 interceptor
// ─────────────────────────────────────────────────────────────
//
// On a 401 from any endpoint (except auth endpoints themselves), call
// /auth/refresh once. If that succeeds, retry the original request. Only
// if refresh itself fails do we treat the user as logged out.
//
// This kills the spurious-logout problem from the previous setup, where
// any single 401 would clear the session.

let refreshPromise: Promise<void> | null = null;
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/refresh') ||
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/logout')
  );
}

async function performRefresh(): Promise<void> {
  // Direct fetch (not the api instance) so we don't recurse through this interceptor.
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('refresh_failed');
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retried || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      // Coalesce concurrent 401s onto a single refresh in flight.
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return api.request(original);
    } catch {
      // Refresh failed — fall through to the global redirect handler.
      if (typeof window !== 'undefined') {
        const isAuthRoute =
          window.location.pathname.startsWith('/login') ||
          window.location.pathname.startsWith('/signup');
        if (!isAuthRoute) {
          // Clear cached user (cookies are already gone server-side).
          localStorage.removeItem('aicruzz_user');
          window.location.href = '/login?expired=1';
        }
      }
      return Promise.reject(error);
    }
  },
);

// Typed error extractor
export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message ?? error.message ?? 'An unexpected error occurred';
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// Auth endpoints
export const authApi = {
  signup: (data: { name: string; email: string; password: string; legalConsented: boolean }) =>
    api.post('/auth/signup', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  logout: () => api.post('/auth/logout'),

  getMe: () => api.get('/auth/me'),

  checkToken: () => api.get('/auth/check'),

  refresh: () => api.post('/auth/refresh'),

  // Short-lived JWT for WebSocket / SSE clients that can't use cookies.
  wsToken: () => api.post('/auth/ws-token'),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};

// Cartoon endpoints
export const cartoonApi = {
  estimate: (type: string, duration?: number) =>
    api.get(`/cartoon/estimate?type=${type}${duration ? `&duration=${duration}` : ''}`),
  listTemplates: (includePublic = true) =>
    api.get(`/cartoon/templates?public=${includePublic}`),
  getTemplate: (id: string) => api.get(`/cartoon/templates/${id}`),
  createTemplate: (data: Record<string, unknown>) => api.post('/cartoon/templates', data),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    api.patch(`/cartoon/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/cartoon/templates/${id}`),
  addScene: (templateId: string, data: Record<string, unknown>) =>
    api.post(`/cartoon/templates/${templateId}/scenes`, data),
  updateScene: (templateId: string, sceneId: string, data: Record<string, unknown>) =>
    api.patch(`/cartoon/templates/${templateId}/scenes/${sceneId}`, data),
  deleteScene: (templateId: string, sceneId: string) =>
    api.delete(`/cartoon/templates/${templateId}/scenes/${sceneId}`),
  reorderScenes: (templateId: string, orderedIds: string[]) =>
    api.put(`/cartoon/templates/${templateId}/scenes/reorder`, { orderedIds }),
  uploadAsset: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/cartoon/upload-asset', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  generate: (data: Record<string, unknown>) => api.post('/cartoon/generate', data),
  listJobs: (page = 1, limit = 20, status?: string, type?: string) =>
    api.get(`/cartoon/jobs?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`),
  getJob: (jobId: string) => api.get(`/cartoon/jobs/${jobId}`),
  cancelJob: (jobId: string) => api.post(`/cartoon/jobs/${jobId}/cancel`),
};

// Asset & character library (Phase 2/3 backend — frontend binding only)
export const assetsApi = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/assets/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (type?: string) =>
    api.get(`/assets${type ? `?type=${type}` : ''}`),
  create: (data: Record<string, unknown>) => api.post('/assets', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/assets/${id}`, data),
  remove: (id: string) => api.delete(`/assets/${id}`),
  listCharacters: () => api.get('/assets/characters'),
  getCharacter: (id: string) => api.get(`/assets/characters/${id}`),
  createCharacter: (data: Record<string, unknown>) =>
    api.post('/assets/characters', data),
  updateCharacter: (id: string, data: Record<string, unknown>) =>
    api.patch(`/assets/characters/${id}`, data),
  deleteCharacter: (id: string) => api.delete(`/assets/characters/${id}`),
};

// Voice (Phase 4 backend — frontend binding only)
export const voiceApi = {
  generate: (data: Record<string, unknown>) => api.post('/voice/generate', data),
  clone: (data: Record<string, unknown>) => api.post('/voice/clone', data),
  listSaved: () => api.get('/voice/saved'),
  link: (data: Record<string, unknown>) => api.post('/voice/link', data),
  unlink: (characterId: string) => api.delete(`/voice/link/${characterId}`),
};

// Cartoon save-as workflows (Phase 3 backend — frontend binding only)
export const cartoonSaveApi = {
  asTemplate: (jobId: string, data: Record<string, unknown>) =>
    api.post(`/cartoon/jobs/${jobId}/save-as-template`, data),
  asCharacter: (jobId: string, data: Record<string, unknown>) =>
    api.post(`/cartoon/jobs/${jobId}/save-as-character`, data),
  asAsset: (jobId: string, data: Record<string, unknown>) =>
    api.post(`/cartoon/jobs/${jobId}/save-as-asset`, data),
};

// Video endpoints
export const videoApi = {
  estimate: (duration: number, resolution: string, qualityMode: string) =>
    api.get(`/video/estimate?duration=${duration}&resolution=${resolution}&qualityMode=${qualityMode}`),
  generate: (data: Record<string, unknown>) => api.post('/video/generate', data),
  listJobs: (page = 1, limit = 20, status?: string) =>
    api.get(`/video/jobs?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
  getJob: (jobId: string) => api.get(`/video/jobs/${jobId}`),
  cancelJob: (jobId: string) => api.post(`/video/jobs/${jobId}/cancel`),
  uploadInput: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/video/upload-input', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Featured showcase banners (Phase 5b — additive)
export const bannersApi = {
  // Public: active banners for one module.
  list: (module: string) => api.get(`/banners?module=${module}`),
  // Public: all active banners across modules (centralized showcase).
  listAll: () => api.get('/banners'),
  // Admin surfaces (require ADMIN role; cookies flow automatically).
  adminList: (module?: string) =>
    api.get(`/admin/banners${module ? `?module=${module}` : ''}`),
  create: (data: Record<string, unknown>) => api.post('/admin/banners', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/banners/${id}`, data),
  remove: (id: string) => api.delete(`/admin/banners/${id}`),
  reorder: (items: { id: string; sortOrder: number }[]) =>
    api.post('/admin/banners/reorder', { items }),
  uploadVideo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/admin/banners/upload-video', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadThumbnail: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/admin/banners/upload-thumbnail', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// API Platform endpoints (user-facing key + subscription management)
export const apiPlatformApi = {
  listPlans: () => api.get('/api-platform/plans'),
  listKeys: () => api.get('/api-platform/keys'),
  createKey: (data: { name: string; ipWhitelist?: string }) =>
    api.post('/api-platform/keys', data),
  revokeKey: (keyId: string) => api.post(`/api-platform/keys/${keyId}/revoke`),
  deleteKey: (keyId: string) => api.delete(`/api-platform/keys/${keyId}`),
  getSubscription: () => api.get('/api-platform/subscription'),
  subscribe: (plan: string) => api.post('/api-platform/subscribe', { plan }),
  cancelSubscription: () => api.post('/api-platform/subscription/cancel'),
  resumeSubscription: () => api.post('/api-platform/subscription/resume'),
};

// Chat endpoints
export const chatApi = {
  listChats: (page = 1, limit = 20) => api.get(`/chat?page=${page}&limit=${limit}`),
  getChat: (chatId: string) => api.get(`/chat/${chatId}`),
  createChat: (model?: string) => api.post('/chat', { model }),
  deleteChat: (chatId: string) => api.delete(`/chat/${chatId}`),
  updateTitle: (chatId: string, title: string) =>
    api.patch(`/chat/${chatId}/title`, { title }),
  uploadFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/chat/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Wallet endpoints
export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  previewCredits: (amount: number) => api.get(`/wallet/preview?amount=${amount}`),
  getTransactions: (page = 1, limit = 20) =>
    api.get(`/wallet/transactions?page=${page}&limit=${limit}`),
  createStripeIntent: (usdAmount: number) =>
    api.post('/billing/stripe/create-intent', { usdAmount }),
  submitCryptoPayment: (formData: FormData) =>
    api.post('/wallet/crypto/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
