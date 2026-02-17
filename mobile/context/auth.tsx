import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, apiRequest, login, logout, refresh, register, type RequestOptions } from '@/lib/api';
import { clearTokens, getTokens, saveTokens } from '@/lib/storage';

type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOutRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let active = true;
    getTokens()
      .then(({ accessToken: storedAccess, refreshToken: storedRefresh }) => {
        if (!active) return;
        setAccessToken(storedAccess);
        setRefreshTokenValue(storedRefresh);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearLocalSession = useCallback(async () => {
    setAccessToken(null);
    setRefreshTokenValue(null);
    try {
      await clearTokens();
    } catch {
      // Ignore storage errors during logout/session cleanup.
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await login(email, password);
    sessionGenerationRef.current += 1;
    signingOutRef.current = false;
    await saveTokens(tokens.access_token, tokens.refresh_token);
    setAccessToken(tokens.access_token);
    setRefreshTokenValue(tokens.refresh_token);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string) => {
      await register(email, password);
      await signIn(email, password);
    },
    [signIn]
  );

  const signOut = useCallback(async () => {
    const tokenToRevoke = refreshTokenValue;
    signingOutRef.current = true;
    sessionGenerationRef.current += 1;
    try {
      await clearLocalSession();
      if (tokenToRevoke) {
        void logout(tokenToRevoke);
      }
    } finally {
      signingOutRef.current = false;
    }
  }, [clearLocalSession, refreshTokenValue]);

  const refreshSession = useCallback(async () => {
    if (signingOutRef.current || !refreshTokenValue) {
      return null;
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const generationAtStart = sessionGenerationRef.current;
    const refreshTokenAtStart = refreshTokenValue;

    const refreshPromise = (async () => {
      try {
        const tokens = await refresh(refreshTokenAtStart);
        if (
          signingOutRef.current ||
          generationAtStart !== sessionGenerationRef.current
        ) {
          return null;
        }
        await saveTokens(tokens.access_token, tokens.refresh_token);
        setAccessToken(tokens.access_token);
        setRefreshTokenValue(tokens.refresh_token);
        return tokens.access_token;
      } catch {
        return null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
      }
    }
  }, [refreshTokenValue]);

  const request = useCallback(
    async <T,>(path: string, options?: RequestOptions) => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      try {
        return await apiRequest<T>(path, accessToken, options);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
        if (!refreshTokenValue) {
          await clearLocalSession();
          throw error;
        }
        const newAccess = await refreshSession();
        if (!newAccess) {
          await clearLocalSession();
          throw error;
        }
        return apiRequest<T>(path, newAccess, options);
      }
    },
    [accessToken, clearLocalSession, refreshTokenValue, refreshSession]
  );

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken: refreshTokenValue,
      loading,
      isAuthenticated: Boolean(accessToken),
      signIn,
      signUp,
      signOut,
      request,
    }),
    [accessToken, refreshTokenValue, loading, signIn, signUp, signOut, request]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
