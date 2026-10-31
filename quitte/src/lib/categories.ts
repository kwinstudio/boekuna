import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type Category = { id: string; icon: IconName; tint: string; words: string[] };

export const CATEGORIES: Category[] = [
  { id: 'food', icon: 'restaurant-outline', tint: 'plum', words: ['eten', 'pizza', 'diner', 'lunch', 'ontbijt', 'restaurant', 'snack', 'friet', 'sushi', 'burger', 'food', 'dinner', 'breakfast', 'koffie', 'coffee', 'taart', 'bakker'] },
  { id: 'groceries', icon: 'cart-outline', tint: 'green', words: ['boodschappen', 'ah', 'albert', 'jumbo', 'lidl', 'aldi', 'plus', 'supermarkt', 'groceries', 'markt'] },
  { id: 'drinks', icon: 'beer-outline', tint: 'sand', words: ['bier', 'drank', 'drinken', 'kroeg', 'bar', 'wijn', 'borrel', 'drinks', 'beer', 'wine', 'cocktail', 'munten', 'rondje'] },
  { id: 'transport', icon: 'car-outline', tint: 'blue', words: ['benzine', 'tanken', 'trein', 'ns', 'bus', 'taxi', 'uber', 'parkeren', 'boot', 'ferry', 'veer', 'vlucht', 'vliegticket', 'fiets', 'huurauto', 'tol', 'fuel', 'train', 'flight', 'parking'] },
  { id: 'stay', icon: 'bed-outline', tint: 'sand', words: ['huisje', 'hotel', 'airbnb', 'camping', 'hostel', 'verblijf', 'overnachting', 'appartement', 'stay'] },
  { id: 'fun', icon: 'ticket-outline', tint: 'plum', words: ['tickets', 'kaartjes', 'museum', 'bioscoop', 'film', 'festival', 'concert', 'entree', 'activiteit', 'uitje', 'escape', 'bowlen'] },
  { id: 'home', icon: 'home-outline', tint: 'sand', words: ['huur', 'gas', 'water', 'licht', 'energie', 'internet', 'wifi', 'netflix', 'spotify', 'schoonmaak', 'rent', 'stroom'] },
  { id: 'gift', icon: 'gift-outline', tint: 'plum', words: ['cadeau', 'kado', 'gift', 'verjaardag', 'present'] },
  { id: 'other', icon: 'pricetag-outline', tint: 'gray', words: [] },
];

export function categoryById(id?: string | null): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Raadt een categorie op basis van de omschrijving. */
export function guessCategory(title: string): string | null {
  const words = title.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter(Boolean);
  for (const c of CATEGORIES) {
    if (c.words.some((w) => words.includes(w) || (w.length >= 4 && words.some((x) => x.includes(w))))) return c.id;
  }
  return null;
}
