import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl?: string | null;
  legalConsented: boolean;
  emailVerified?: boolean;
  wallet: { credits: number; expiresAt: string | null } | null;
}

export interface AuthState {
  user: AuthUser | null;
  // Kept for back-compat with code that still reads `token` from auth state.
  // The real auth credential now lives in an httpOnly cookie set by the server.
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Cached non-sensitive user profile, used only for instant paint on hydrate.
// The cookie is the source of truth — this is not a credential.
export const USER_KEY = 'aicruzz_user';
// Legacy token key — only kept so we can clean it up from existing devices.
export const TOKEN_KEY = 'aicruzz_token';

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
};

// Hydrate flow:
//   1. Show cached user instantly so the dashboard doesn't flash to /login.
//   2. Call /auth/me. The api client's 401 interceptor will silently call
//      /auth/refresh once if the access cookie is expired.
//   3. Only clear state if /auth/me ultimately fails (no valid session).
export const hydrateAuth = createAsyncThunk('auth/hydrate', async (_, { dispatch }) => {
  if (typeof window === 'undefined') {
    dispatch(setHydrated());
    return;
  }

  // One-time cleanup of legacy localStorage token (now lives in cookie).
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }

  const userRaw = localStorage.getItem(USER_KEY);
  let cached: AuthUser | null = null;
  if (userRaw) {
    try {
      cached = JSON.parse(userRaw) as AuthUser;
    } catch {
      cached = null;
    }
  }

  if (cached) {
    // Optimistic — confirmed below by /me. If /me fails, we clear.
    dispatch(setUserAndAuthed(cached));
  }

  try {
    const res = await authApi.getMe();
    const fresh = (res.data as { data: { user: AuthUser } }).data.user;
    localStorage.setItem(USER_KEY, JSON.stringify(fresh));
    dispatch(setUserAndAuthed(fresh));
  } catch {
    // /me failed even after the auto-refresh attempt → genuinely logged out.
    localStorage.removeItem(USER_KEY);
    dispatch(clearCredentials());
  } finally {
    dispatch(setHydrated());
  }
});

export const logoutThunk = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
  try {
    await authApi.logout();
  } catch {
    // ignore — clear locally anyway
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
  dispatch(clearCredentials());
});

export const refreshUserThunk = createAsyncThunk('auth/refresh', async (_, { dispatch }) => {
  try {
    const res = await authApi.getMe();
    const user = (res.data as { data: { user: AuthUser } }).data.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    dispatch(setUser(user));
  } catch {
    // silently fail to match prior behavior
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Called from login/signup flows. Token is no longer needed
    // (cookie handles it) but we still accept it for back-compat callers.
    setCredentials: (
      state,
      action: PayloadAction<{ token?: string | null; user: AuthUser }>,
    ) => {
      state.token = action.payload.token ?? null;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.isLoading = false;
    },
    setUserAndAuthed: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    clearCredentials: (state) => {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
    setUser: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload;
    },
    mergeUser: (state, action: PayloadAction<Partial<AuthUser>>) => {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
    },
    setHydrated: (state) => {
      state.isLoading = false;
    },
  },
});

export const {
  setCredentials,
  setUserAndAuthed,
  clearCredentials,
  setUser,
  mergeUser,
  setHydrated,
} = authSlice.actions;

export default authSlice.reducer;
