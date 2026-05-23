'use client';

import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setCredentials,
  mergeUser,
  logoutThunk,
  refreshUserThunk,
  USER_KEY,
  type AuthUser,
} from '@/store/slices/authSlice';

export type { AuthUser };

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // `token` arg is now unused (auth lives in an httpOnly cookie set by the
  // server on /auth/login + /auth/signup). Kept in the signature so existing
  // callers don't have to be edited in this pass.
  login: (token: string | null, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export function useAuth(): AuthContextValue {
  const dispatch = useAppDispatch();
  const { user, token, isLoading, isAuthenticated } = useAppSelector((s) => s.auth);

  const login = useCallback(
    (_unusedToken: string | null, nextUser: AuthUser) => {
      if (typeof window !== 'undefined') {
        // Cache the user profile only — the token is in an httpOnly cookie.
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      }
      dispatch(setCredentials({ token: null, user: nextUser }));
    },
    [dispatch],
  );

  const logout = useCallback(async () => {
    await dispatch(logoutThunk());
  }, [dispatch]);

  const refreshUser = useCallback(async () => {
    await dispatch(refreshUserThunk());
  }, [dispatch]);

  const updateUser = useCallback(
    (updates: Partial<AuthUser>) => {
      if (typeof window !== 'undefined' && user) {
        const merged = { ...user, ...updates };
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
      }
      dispatch(mergeUser(updates));
    },
    [dispatch, user],
  );

  return { user, token, isLoading, isAuthenticated, login, logout, refreshUser, updateUser };
}
