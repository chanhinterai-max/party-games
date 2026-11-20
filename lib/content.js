// Client-safe shared constants (imported by pages). Keep this file SMALL: it ships to every phone.
// The question bank seed lives in lib/seed.js (server-only).
export const LEVELS = [
  { id: 'children', name: 'Children', emoji: '🧃', hint: 'Easy laughs and icebreakers.' },
  { id: 'teen', name: 'Teen', emoji: '😏', hint: 'Cheeky secrets and playful contact.' },
  { id: 'adult', name: 'Adult', emoji: '🌶️', hint: 'Bold dares with WHO, WHAT and WHERE.' },
];
export const LEVEL_IDS = LEVELS.map((l) => l.id);

// Obvious private/intimate body parts are never allowed in WHERE or WHAT text added by an admin.
export const PRIVATE_BLOCKLIST = /\b(chest|breasts?|boobs?|nipples?|butt|buttocks?|bum|arse|ass|groin|crotch|genitals?|penis|vagina|privates?|inner[- ]thighs?|lips?|mouth|tongue|pubic|testicles?|bikini line|underwear)\b/i;
export function hasPrivatePart(text) {
  return PRIVATE_BLOCKLIST.test(String(text || ''));
}

// Running baby animals (UI) and the hidden chicken-out rule target options.
export const ANIMALS = [
  { id: 'puppy', emoji: '🐶', happy: '🐶', name: 'Puppy' },
  { id: 'kitten', emoji: '🐱', happy: '😻', name: 'Kitten' },
  { id: 'chick', emoji: '🐥', happy: '🐣', name: 'Chick' },
  { id: 'bunny', emoji: '🐰', happy: '🐰', name: 'Bunny' },
  { id: 'piglet', emoji: '🐷', happy: '🐷', name: 'Piglet' },
];

// Default petted-animal duration (seconds). Also the window for the hidden chicken-out rule.
export const DEFAULT_PET_SECONDS = 20;
export const PET_SECONDS_MIN = 3;
export const PET_SECONDS_MAX = 300;

export const DRINK_CATEGORIES = [
  { id: 'alcohol', name: 'Alcohol', emoji: '🍺' },
  { id: 'sparkling', name: 'Something sparkling', emoji: '🥂' },
  { id: 'water', name: 'Water', emoji: '💧' },
];

export const DEFAULT_DRINKS = {
  alcohol: ['Take a small sip of your drink', 'A small shot chosen by the group', 'Clink glasses with someone and take a sip'],
  sparkling: ['A sip of something sparkling (prosecco, soda or sparkling water)', 'Order a sparkling mocktail for yourself'],
  water: ['Drink a whole glass of water. Hydration hero!', 'Take three big sips of water'],
};

export const DEFAULT_ODDS = {
  normal: { alcohol: 80, sparkling: 10, water: 10 },
  rule: { enabled: true, animal: 'kitten', odds: { water: 80, sparkling: 10, alcohol: 10 } },
};

