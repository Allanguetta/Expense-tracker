import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { DARK_COLORS, LIGHT_COLORS, type ThemeColors } from '@/constants/ui-theme';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
};

const STORAGE_KEY = 'APP_THEME_MODE';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

async function readStoredMode() {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStoredMode(mode: ThemeMode) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      return;
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = Appearance.getColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    readStoredMode()
      .then((value) => {
        if (!active) return;
        if (value === 'light' || value === 'dark') {
          setMode(value);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredMode(mode).catch(() => undefined);
  }, [hydrated, mode]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const colors = useMemo(() => (mode === 'dark' ? DARK_COLORS : LIGHT_COLORS), [mode]);

  const value = useMemo(
    () => ({
      mode,
      colors,
      toggleTheme,
      setTheme: setMode,
    }),
    [mode, colors, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
}

export function useThemeColors() {
  return useThemeMode().colors;
}
