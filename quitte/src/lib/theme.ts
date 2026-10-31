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
  accentSoft: '#EEF3F2',
  onAccent: '#FFFFFF',
  owe: '#B42318',
  oweBar: '#C8553F',
  oweSoft: '#FFFFFF',
  gain: '#1B6E43',
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

/** Categorie-iconen zijn bewust neutraal (geen kleurvlakken) voor een zakelijke uitstraling. */
export function useTint(_name: string) {
  const t = useTheme();
  return { bg: t.neutralFill, fg: t.neutralIcon };
}

export const radius = { card: 12, button: 12, field: 10, chip: 8 };
