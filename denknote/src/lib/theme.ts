import { useColorScheme } from 'react-native';
import { useStore } from './store';

const light = {
  scheme: 'light' as 'light' | 'dark',
  bg: '#F7F4EE',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEBE3',
  text: '#1D1B18',
  muted: '#6B665E',
  faint: '#A29C92',
  border: 'rgba(29,27,24,0.08)',
  borderStrong: 'rgba(29,27,24,0.16)',
  accent: '#4F6B5A',
  accentSoft: 'rgba(79,107,90,0.10)',
  onAccent: '#FFFFFF',
  primary: '#1D1B18',
  onPrimary: '#F7F4EE',
  danger: '#B4432F',
  dangerSoft: 'rgba(180,67,47,0.08)',
  shadow: 'rgba(40,32,20,0.06)',
};

const dark: typeof light = {
  scheme: 'dark',
  bg: '#151412',
  surface: '#1F1D1A',
  surfaceAlt: '#29261F',
  text: '#F2EEE7',
  muted: '#A8A196',
  faint: '#6E685F',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.16)',
  accent: '#9DB8A6',
  accentSoft: 'rgba(157,184,166,0.12)',
  onAccent: '#151412',
  primary: '#F2EEE7',
  onPrimary: '#151412',
  danger: '#E07A63',
  dangerSoft: 'rgba(224,122,99,0.12)',
  shadow: 'rgba(0,0,0,0.3)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  const system = useColorScheme();
  const pref = useStore((s) => s.themePref);
  const mode = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return mode === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 25 },
  callout: { fontSize: 15, lineHeight: 21 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
};
