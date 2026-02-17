export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  muted: string;
  primary: string;
  primaryDark: string;
  accent: string;
  accentSoft: string;
  danger: string;
  line: string;
  ringTrack: string;
  shadow: string;
};

export const DARK_COLORS: ThemeColors = {
  background: '#0B0F0E',
  card: '#111816',
  text: '#E6F3EF',
  muted: '#8E9F98',
  primary: '#008C84',
  primaryDark: '#00736B',
  accent: '#2DD4BF',
  accentSoft: '#0F2D28',
  danger: '#F87171',
  line: '#1C2A26',
  ringTrack: '#1D2A26',
  shadow: 'rgba(0, 0, 0, 0.6)',
};

export const LIGHT_COLORS: ThemeColors = {
  background: '#F4F7F6',
  card: '#FFFFFF',
  text: '#0C1B16',
  muted: '#6B7C76',
  primary: '#008C84',
  primaryDark: '#00736B',
  accent: '#14B8A6',
  accentSoft: '#E2F5F0',
  danger: '#EF4444',
  line: '#E2E8E5',
  ringTrack: '#E6ECE9',
  shadow: 'rgba(17, 24, 39, 0.12)',
};

export const COLORS = DARK_COLORS;

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
};
