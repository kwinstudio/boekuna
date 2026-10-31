import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F1',
  card: '#FFFFFF',
  text: '#14171A',
  sub: '#5A6169',
  line: '#E4E6E1',
  border: '#DADDD6',
  field: '#FFFFFF',
  segment: '#E7E9E4',
  accent: '#0A6B58',
  accentText: '#07503F',
  accentSoft: '#E3F1EC',
  onAccent: '#FFFFFF',
  owe: '#B3431A',
  oweBar: '#D9774F',
  oweSoft: '#FBEAE2',
  gain: '#0A6B58',
  toast: '#14171A',
  toastText: '#FFFFFF',
  toastAction: '#7FD3BE',
  danger: '#B42318',
  scrim: 'rgba(0,0,0,0.35)',
};

const dark: typeof light = {
  bg: '#0F1112',
  card: '#1A1D1F',
  text: '#F1F2EF',
  sub: '#A6ADB4',
  line: '#2A2E31',
  border: '#373C40',
  field: '#1A1D1F',
  segment: '#25292C',
  accent: '#2FA88C',
  accentText: '#7FD3BE',
  accentSoft: '#163A31',
  onAccent: '#06231C',
  owe: '#F0936B',
  oweBar: '#D9774F',
  oweSoft: '#3A2219',
  gain: '#5CC9AC',
  toast: '#F1F2EF',
  toastText: '#14171A',
  toastAction: '#0A6B58',
  danger: '#F97066',
  scrim: 'rgba(0,0,0,0.55)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Zachte achtergrond + iconkleur per categorie (licht/donker). */
export const tints: Record<string, { bg: string; fg: string; bgDark: string; fgDark: string }> = {
  blue: { bg: '#E8EEF6', fg: '#2F5C8F', bgDark: '#1C2A3A', fgDark: '#8DB4E2' },
  sand: { bg: '#F5EEE3', fg: '#8A5A14', bgDark: '#33291A', fgDark: '#E2B672' },
  plum: { bg: '#F3E9F0', fg: '#7A3A66', bgDark: '#33202D', fgDark: '#E0A3CD' },
  green: { bg: '#EAF2E3', fg: '#3D6B1F', bgDark: '#1F2B17', fgDark: '#A8D27F' },
  teal: { bg: '#E3F1EC', fg: '#0A6B58', bgDark: '#163A31', fgDark: '#7FD3BE' },
  gray: { bg: '#EDEEEA', fg: '#5A6169', bgDark: '#25292C', fgDark: '#A6ADB4' },
};

export function useTint(name: string) {
  const dark = useColorScheme() === 'dark';
  const t = tints[name] ?? tints.gray;
  return dark ? { bg: t.bgDark, fg: t.fgDark } : { bg: t.bg, fg: t.fg };
}

export const radius = { card: 18, button: 16, field: 14, chip: 20 };
