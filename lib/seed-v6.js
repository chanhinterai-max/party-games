// SERVER-ONLY v6 seed data ("Party Animal"). Inserted ONCE by the 'seed_v6' migration (lib/db.js);
// only missing rows are inserted, and only UNCHANGED v5 seed texts are rewritten.

// 20 cute animals: 10 predators + 10 prey. id = 'an-<slug>'.
export const POOL = {
  predator: [
    ['Lion', '🦁'], ['Tiger', '🐯'], ['Wolf', '🐺'], ['Fox', '🦊'], ['Bear', '🐻'],
    ['Shark', '🦈'], ['Eagle', '🦅'], ['Leopard', '🐆'], ['Crocodile', '🐊'], ['Owl', '🦉'],
  ],
  prey: [
    ['Bunny', '🐰'], ['Deer', '🦌'], ['Lamb', '🐑'], ['Mouse', '🐭'], ['Chick', '🐥'],
    ['Squirrel', '🐿️'], ['Hamster', '🐹'], ['Kitten', '🐱'], ['Duck', '🦆'], ['Penguin', '🐧'],
  ],
};
export const poolId = (name) => `an-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// Animal Match v6: {a} = PREDATOR, {b} = PREY. Bar theme: small drinks, secrets, light flirty touch.
export const MATCH_V6 = {
  children: [
    { t: '{a}, chase {b} once around the table (walking only)!' },
    { t: '{a}, give {b} a high-five, then roar together!' },
    { t: '{a} and {b}: 10-second staring contest. Loser makes their animal sound!', s: 10 },
    { t: '{a}, pour {b} a glass of water and toast to friendship.' },
  ],
  teen: [
    { t: '{a}, chase {b} once around the table!' },
    { t: '{a}, feed {b} a snack or a sip of their drink.' },
    { t: '{b}, tell {a} one secret, or {a} picks your next sip.' },
    { t: '{a} and {b}: link arms and sip together, jungle style.' },
    { t: '{a} and {b}: 10-second dance-off. The group picks the winner!', s: 10 },
  ],
  adult: [
    { t: '{a}, feed {b} a sip of your drink.' },
    { t: '{a}, chase {b} once around the table. If caught, {b} takes a sip.' },
    { t: '{b}, whisper a secret to {a}. {a} decides: keep it or tell the group.' },
    { t: '{a}, slow dance with {b} for 20 seconds, prowling style.', s: 20 },
    { t: '{a}, kiss the back of the hand of {b}, like royalty.' },
    { t: '{a}, give {b} a 10-second shoulder massage.', s: 10 },
    { t: '{a} and {b}: hold eye contact for 15 seconds. First to laugh sips.', s: 15 },
    { t: '{a}, pick the next drink for {b}. {b} takes a sip of it.' },
    { t: '{b}, sit next to {a} until your next turn. No escaping!' },
  ],
};
// v5 seeded Animal Match items: id -> v6 replacement text (applied only if the text is still the v5 seed).
export const MATCH_V5_REWRITE = {
  'sp-match-children-1': '{a}, give {b} a high-five, then roar together!',
  'sp-match-children-2': '{a}, pour {b} a glass of water and toast to friendship.',
  'sp-match-teen-1': '{a} and {b}: link arms and sip together, jungle style.',
  'sp-match-teen-2': '{a} and {b}: 10-second dance-off. The group picks the winner!',
  'sp-match-adult-1': '{a}, feed {b} a sip of your drink.',
  'sp-match-adult-2': '{a}, slow dance with {b} for 20 seconds, prowling style.',
  'sp-match-adult-3': '{a} and {b}: hold eye contact for 15 seconds. First to laugh sips.',
  'sp-match-adult-4': '{b}, whisper a secret to {a}. {a} decides: keep it or tell the group.',
  'sp-match-adult-5': '{a}, kiss the back of the hand of {b}, like royalty.',
};

// Human content (only used when a game has a Human, i.e. an odd player count).
export const HUMAN = {
  surprise: {
    children: [
      { t: 'Human, you’re the zookeeper: pick a predator and a prey to high-five.' },
      { t: 'Human, feed every animal a compliment!' },
    ],
    teen: [
      { t: 'Human, you’re the zookeeper: pick a predator and a prey to clink glasses.' },
      { t: 'Human, every predator does their best roar. Loudest one picks who sips.' },
    ],
    adult: [
      { t: 'Human, you’re the zookeeper: pick a predator and a prey to clink glasses.' },
      { t: 'Human, you’re the ringmaster: pick a predator to feed a prey a sip.' },
      { t: 'Human, pick a predator and a prey to slow dance for 15 seconds.', s: 15 },
    ],
  },
  truth: {
    children: [
      { t: 'Human, which animal here would you most like as a pet?' },
      { t: 'If you could swap places with any animal here, which one and why?' },
    ],
    teen: [
      { t: 'Which predator here would you trust least with your secrets?' },
      { t: 'Which prey here would you protect at all costs?' },
    ],
    adult: [
      { t: 'Which predator here would you let catch you?' },
      { t: 'Which animal here would you take home tonight, and why?' },
      { t: 'Which predator and prey here would make the cutest couple?' },
    ],
  },
  dare: {
    children: [
      { t: 'Do your best impression of the animal of {who} for 10 seconds.', s: 10 },
      { t: 'Act out a zookeeper feeding time for {who}.' },
    ],
    teen: [
      { t: 'Tame {who}: get them to make their animal sound within 20 seconds.', s: 20 },
      { t: 'Give {who} a new animal nickname for the rest of the game.' },
    ],
    adult: [
      { t: 'Tame {who} with your best compliment until they smile.' },
      { t: 'Lead {who} in a 15-second slow dance, zookeeper’s ball style.', s: 15 },
      { t: 'Feed {who} a sip of your drink.' },
    ],
  },
};
