import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { HUES, hueFor, type Hue } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Iconen om een lijst herkenbaar te maken. */
export const LIST_ICONS: IconName[] = [
  'sunny-outline',
  'airplane-outline',
  'home-outline',
  'restaurant-outline',
  'beer-outline',
  'car-outline',
  'bed-outline',
  'heart-outline',
  'people-outline',
  'gift-outline',
  'football-outline',
  'musical-notes-outline',
  'briefcase-outline',
  'cart-outline',
  'snow-outline',
  'school-outline',
];

const GUESS: [RegExp, IconName][] = [
  [/vakantie|weekend|strand|zon|texel|holiday|trip|reis/i, 'sunny-outline'],
  [/vlucht|vliegen|flight|stedentrip|city/i, 'airplane-outline'],
  [/huis|woning|huisgenot|home|flat|kamer|studentenhuis/i, 'home-outline'],
  [/eten|diner|etentje|restaurant|lunch|bbq/i, 'restaurant-outline'],
  [/borrel|kroeg|bier|feest|party|carnaval|festival/i, 'beer-outline'],
  [/auto|road|rijden/i, 'car-outline'],
  [/ski|wintersport|sneeuw/i, 'snow-outline'],
  [/samen|stel|relatie|couple|wij/i, 'heart-outline'],
  [/cadeau|verjaardag|kado|gift|sinterklaas|kerst/i, 'gift-outline'],
  [/voetbal|sport|team|club|hockey/i, 'football-outline'],
  [/werk|kantoor|team|collega/i, 'briefcase-outline'],
  [/boodschappen|supermarkt/i, 'cart-outline'],
];

export function guessListIcon(name: string): IconName {
  return GUESS.find(([re]) => re.test(name))?.[1] ?? 'people-outline';
}

export function listLook(list: { id: string; name: string; settings?: { color?: string | null; icon?: string | null } | null }): {
  hue: Hue;
  icon: IconName;
} {
  const color = list.settings?.color;
  const icon = list.settings?.icon;
  return {
    hue: color && (HUES as readonly string[]).includes(color) ? (color as Hue) : hueFor(list.id),
    icon: icon && LIST_ICONS.includes(icon as IconName) ? (icon as IconName) : guessListIcon(list.name),
  };
}

export { HUES };
