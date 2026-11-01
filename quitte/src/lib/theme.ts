import { useColorScheme } from 'react-native';

// Wit en luchtig met één merkkleur: vertrouwensblauw. Groen en koraal alleen op bedragen.
const light = {
  bg: '#FFFFFF',
  card: '#F4F6FA',
  text: '#0E1726',
  sub: '#667085',
  line: '#E9ECF1',
  border: '#DDE2E9',
  field: '#FFFFFF',
  segment: '#EEF1F6',
  accent: '#2563EB',
  accentText: '#1D4ED8',
  accentSoft: '#EAF1FF',
  onAccent: '#FFFFFF',
  owe: '#E0533A',
  oweBar: '#F08A74',
  oweSoft: '#FFFFFF',
  gain: '#0E9F6E',
  toast: '#0E1726',
  toastText: '#FFFFFF',
  toastAction: '#93B4FF',
  danger: '#D92D20',
  scrim: 'rgba(14,23,38,0.35)',
  neutralIcon: '#344054',
  neutralFill: '#F2F4F7',
  ink: '#0E1726',
  onInk: '#FFFFFF',
  hero: '#2563EB',
  onHero: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0B0F17',
  card: '#151B26',
  text: '#F2F4F7',
  sub: '#98A2B3',
  line: '#232B39',
  border: '#2E3747',
  field: '#151B26',
  segment: '#1C2431',
  accent: '#6B9BFF',
  accentText: '#93B4FF',
  accentSoft: '#17223A',
  onAccent: '#071430',
  owe: '#FF8F7A',
  oweBar: '#E2735F',
  oweSoft: '#151B26',
  gain: '#4ADE9B',
  toast: '#F2F4F7',
  toastText: '#0E1726',
  toastAction: '#2563EB',
  danger: '#FF8F7A',
  scrim: 'rgba(0,0,0,0.55)',
  neutralIcon: '#D0D5DD',
  neutralFill: '#1C2431',
  ink: '#F2F4F7',
  onInk: '#0B0F17',
  hero: '#2F5FD0',
  onHero: '#FFFFFF',
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

export const radius = { card: 18, button: 16, field: 14, chip: 12 };

/** Bedragen: zware cijfers met vaste breedte, zodat kolommen netjes uitlijnen. */
export const num = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
