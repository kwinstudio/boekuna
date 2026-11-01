import { useColorScheme } from 'react-native';

// Rustige "dienst-app"-stijl: neutrale vlakken, één merkkleur voor acties,
// groen/rood alleen op bedragen.
const light = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  text: '#1C1C1E',
  sub: '#636366',
  line: '#E5E5EA',
  border: '#D1D1D6',
  field: '#FFFFFF',
  segment: '#E5E5EA',
  accent: '#0B5C4F',
  accentText: '#0B5C4F',
  accentSoft: '#E7F0ED',
  onAccent: '#FFFFFF',
  owe: '#C0392B',
  oweBar: '#D9705C',
  oweSoft: '#FFFFFF',
  gain: '#1E7A4C',
  toast: '#1C1C1E',
  toastText: '#FFFFFF',
  toastAction: '#8FD3C2',
  danger: '#B42318',
  scrim: 'rgba(0,0,0,0.35)',
  neutralIcon: '#3A3A3C',
  neutralFill: '#F2F2F7',
};

const dark: typeof light = {
  bg: '#000000',
  card: '#1C1C1E',
  text: '#F2F2F7',
  sub: '#A1A1A6',
  line: '#38383A',
  border: '#48484A',
  field: '#1C1C1E',
  segment: '#2C2C2E',
  accent: '#4FB3A0',
  accentText: '#7FCDBD',
  accentSoft: '#1E2B29',
  onAccent: '#04201B',
  owe: '#FF8A7A',
  oweBar: '#E0715E',
  oweSoft: '#1C1C1E',
  gain: '#6FD39A',
  toast: '#F2F2F7',
  toastText: '#1C1C1E',
  toastAction: '#0B5C4F',
  danger: '#FF8A7A',
  scrim: 'rgba(0,0,0,0.55)',
  neutralIcon: '#D1D1D6',
  neutralFill: '#2C2C2E',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

// Zachte pastelkleuren voor lijsten, personen en categorieën. Eén sterke kleur per scherm blijft de merkkleur.
export const HUES = ['teal', 'blue', 'purple', 'coral', 'pink', 'amber', 'green'] as const;
export type Hue = (typeof HUES)[number] | 'gray';

const PALETTE: Record<Hue, { light: { bg: string; fg: string; strong: string; soft: string }; dark: { bg: string; fg: string; strong: string; soft: string } }> = {
  teal: { light: { bg: '#E1F5EE', fg: '#085041', strong: '#0F6E56', soft: '#F0FAF6' }, dark: { bg: '#0E3B32', fg: '#9FE1CB', strong: '#5DCAA5', soft: '#0A2620' } },
  blue: { light: { bg: '#E6F1FB', fg: '#0C447C', strong: '#185FA5', soft: '#F2F8FD' }, dark: { bg: '#0F2F4F', fg: '#B5D4F4', strong: '#85B7EB', soft: '#0A1F35' } },
  purple: { light: { bg: '#EEEDFE', fg: '#3C3489', strong: '#534AB7', soft: '#F6F5FF' }, dark: { bg: '#2A2560', fg: '#CECBF6', strong: '#AFA9EC', soft: '#1B1840' } },
  coral: { light: { bg: '#FAECE7', fg: '#712B13', strong: '#993C1D', soft: '#FDF5F2' }, dark: { bg: '#4A2112', fg: '#F5C4B3', strong: '#F0997B', soft: '#30160C' } },
  pink: { light: { bg: '#FBEAF0', fg: '#72243E', strong: '#993556', soft: '#FDF4F7' }, dark: { bg: '#4B1A2D', fg: '#F4C0D1', strong: '#ED93B1', soft: '#30111D' } },
  amber: { light: { bg: '#FAEEDA', fg: '#633806', strong: '#854F0B', soft: '#FDF7EC' }, dark: { bg: '#40280A', fg: '#FAC775', strong: '#EF9F27', soft: '#2A1A06' } },
  green: { light: { bg: '#EAF3DE', fg: '#27500A', strong: '#3B6D11', soft: '#F4F9EE' }, dark: { bg: '#20380C', fg: '#C0DD97', strong: '#97C459', soft: '#152508' } },
  gray: { light: { bg: '#EFEFF4', fg: '#3A3A3C', strong: '#636366', soft: '#F7F7FA' }, dark: { bg: '#2C2C2E', fg: '#D1D1D6', strong: '#A1A1A6', soft: '#1C1C1E' } },
};

const ALIAS: Record<string, Hue> = { plum: 'purple', sand: 'amber' };

export function usePalette(name: string) {
  const dark = useColorScheme() === 'dark';
  const hue = (ALIAS[name] ?? (name in PALETTE ? name : 'gray')) as Hue;
  return PALETTE[hue][dark ? 'dark' : 'light'];
}

/** Vaste kleur per naam (zelfde naam = zelfde kleur op elke telefoon). */
export function hueFor(text: string): Hue {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.toLowerCase().charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function useTint(name: string) {
  const p = usePalette(name);
  return { bg: p.bg, fg: p.fg };
}

export const radius = { card: 14, button: 14, field: 12, chip: 10 };
