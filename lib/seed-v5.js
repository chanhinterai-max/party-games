// SERVER-ONLY v5 seed data. Inserted ONCE by the 'seed_v5' migration (lib/db.js), only rows that are
// missing (ON CONFLICT DO NOTHING), so a user's own bank / drink edits are never wiped or resurrected.

// 40 new flirty Adult items (20 truths + 20 dares). heat 1-3, seconds = optional countdown.
export const ADULT_V5_TRUTHS = [
  { t: 'What was your very first impression of {who}?', h: 2 },
  { t: "What's the most romantic thing a stranger has ever done for you?", h: 2 },
  { t: 'What song instantly puts you in a flirty mood?', h: 1 },
  { t: "What's your go-to move when you want someone to notice you?", h: 2 },
  { t: 'Which feature of {who} would you steal for a day?', h: 1 },
  { t: "What's the cheesiest pickup line that actually worked on you?", h: 1 },
  { t: 'Describe your perfect first date in exactly five words.', h: 2 },
  { t: 'Who here would you trust to plan a surprise date for you?', h: 2 },
  { t: 'Have you ever had a crush on a friend’s sibling?', h: 3 },
  { t: "What's the boldest text you've ever sent at 2 a.m.?", h: 3 },
  { t: 'What makes someone instantly more attractive to you?', h: 2 },
  { t: 'If {who} asked you to dance right now, what would you say?', h: 3 },
  { t: 'What compliment do you secretly love hearing the most?', h: 1 },
  { t: 'What was your most memorable slow dance?', h: 2 },
  { t: 'Have you ever kissed someone you just met that night?', h: 3 },
  { t: 'What would your dating-app bio honestly say?', h: 1 },
  { t: 'Which celebrity does {who} remind you of, and is that a compliment?', h: 1 },
  { t: "What's a small gesture that melts your heart every time?", h: 2 },
  { t: 'Rate your flirting skills from 1 to 10, then let {who} rate them too.', h: 2 },
  { t: 'What is the most spontaneous thing you have done for love?', h: 3 },
];
export const ADULT_V5_DARES = [
  { t: 'Hold eye contact with {who} for 20 seconds without laughing.', h: 2, s: 20 },
  { t: 'Slow dance with {who} for 20 seconds, no music needed.', h: 3, s: 20 },
  { t: 'Whisper your best pickup line to {who}.', h: 2 },
  { t: 'Give {who} a gentle shoulder massage for 15 seconds.', h: 3, s: 15 },
  { t: 'Kiss the back of the hand of {who}, like royalty.', h: 2 },
  { t: 'Let {who} draw a tiny heart on your {where} with their finger.', h: 2 },
  { t: 'Serenade {who} with one line of a love song.', h: 1 },
  { t: 'Hold hands with {who} until your next turn.', h: 2 },
  { t: 'Give {who} a slow, dramatic wink across the table.', h: 1 },
  { t: 'Rest your head on the shoulder of {who} for 15 seconds.', h: 2, s: 15 },
  { t: 'Tell {who} three things you find attractive about them.', h: 2 },
  { t: 'Let {who} fix your hair or collar however they like.', h: 1 },
  { t: 'Hug {who} for 10 seconds, no letting go early.', h: 2, s: 10 },
  { t: 'Kiss {who} on the cheek.', h: 3 },
  { t: 'Trace a letter on the {where} of {who}; they must guess it.', h: 2 },
  { t: 'Pretend to write your number on the {where} of {who} with your finger.', h: 3 },
  { t: 'Feed {who} a snack or a garnish from your drink.', h: 2 },
  { t: 'Sit back to back with {who} and guess their eye colour.', h: 1 },
  { t: 'Give {who} your most seductive "come here" look for 5 seconds.', h: 3, s: 5 },
  { t: 'Tell {who} what you would order for them on a first date, and why.', h: 1 },
];

// Pick-a-partner dares: the PLAYER chooses who ({partner} -> "a partner of your choice").
export const PARTNER_DARES = {
  teen: [
    { t: 'Pick {partner} and invent a secret handshake together.', h: 1 },
    { t: 'Choose {partner} for a 10-second dance-off. The group picks the winner.', h: 2, s: 10 },
  ],
  adult: [
    { t: 'Pick {partner} and slow dance together for 20 seconds.', h: 3, s: 20 },
    { t: 'Choose {partner}: hold hands and look into each other’s eyes for 15 seconds.', h: 3, s: 15 },
    { t: 'Pick {partner} and pose together for the most romantic photo of the night.', h: 2 },
    { t: 'Choose {partner} and give them a 10-second shoulder massage.', h: 3, s: 10 },
    { t: 'Pick {partner} and link arms to take a sip together, wedding style.', h: 2 },
  ],
};
// Two-player dares: the current player AND {who} both do it.
export const TWO_PLAYER_DARES = {
  teen: [
    { t: 'You and {who} have 20 seconds to invent a couple name and a celebration pose.', h: 1, s: 20 },
  ],
  adult: [
    { t: 'You and {who} swap one accessory and strut it like a runway couple.', h: 1 },
    { t: 'You and {who} hold a staring contest. Whoever laughs first takes a sip.', h: 2 },
    { t: 'You and {who} slow dance for 20 seconds while everyone hums.', h: 3, s: 20 },
    { t: 'You and {who} whisper one compliment to each other at the same time.', h: 2 },
  ],
};

// Surprise cards (global; editable by advanced users + admin). {a}/{b} = Animal Match animals.
export const SURPRISE_TYPES = ['match', 'virus', 'vote', 'whisper', 'chooser'];
export const SURPRISES = {
  match: {
    children: [
      { t: '{a} and {b}: reveal yourselves and invent a secret handshake!' },
      { t: '{a} and {b}: high-five and toast each other with a sip of water.' },
    ],
    teen: [
      { t: '{a} and {b}, reveal yourselves! Link arms and take a sip together.' },
      { t: '{a} and {b}: 10-second dance-off, the group picks the winner!', s: 10 },
    ],
    adult: [
      { t: '{a} and {b}, reveal yourselves! Link arms and sip, wedding style.' },
      { t: '{a} and {b}: slow dance together for 20 seconds.', s: 20 },
      { t: '{a} and {b}: hold eye contact for 15 seconds. First to laugh sips.', s: 15 },
      { t: '{a} and {b}: whisper your best compliment to each other.' },
      { t: '{a} and {b}: kiss each other on the cheek, then take a bow.' },
    ],
  },
  virus: {
    children: [
      { t: 'No saying anyone’s name! Slip up = a sip of water.' },
      { t: 'Everyone talks like a pirate. Arrr!' },
    ],
    teen: [
      { t: 'No saying "yes" or "no". Slip up = a sip.' },
      { t: 'Drink only with your non-dominant hand.' },
    ],
    adult: [
      { t: 'Call everyone "darling" or take a sip.' },
      { t: 'No pointing. Get caught = a sip.' },
      { t: 'Every time someone laughs, the person on their left gets a compliment.' },
    ],
  },
  vote: {
    children: [
      { t: 'On 3, point at who is most likely to become famous. Most votes takes a sip (water counts).' },
      { t: 'On 3, point at the best dancer here. Most votes shows a move!' },
    ],
    teen: [
      { t: 'On 3, point at who is most likely to text their ex tonight. Most votes sips.' },
      { t: 'On 3, point at who has the best laugh. Most votes sips.' },
    ],
    adult: [
      { t: 'On 3, point at the best kisser here (no testing!). Most votes sips.' },
      { t: 'On 3, point at who is most likely to leave with a phone number tonight. Most votes sips.' },
      { t: 'On 3, point at who has the most charming smile. Most votes sips.' },
    ],
  },
  whisper: {
    children: [
      { t: 'Who here tells the best jokes?' },
      { t: 'Who here would survive longest on a desert island?' },
    ],
    teen: [
      { t: 'Who here would you swap phones with for a day?' },
      { t: 'Who here would be the best secret-keeper?' },
    ],
    adult: [
      { t: 'Who here would you most like to slow dance with?' },
      { t: 'Who here would you take on a date tonight?' },
      { t: 'Who here has the most kissable cheeks?' },
    ],
  },
  chooser: {
    children: [
      { t: 'The chosen one does a 10-second victory dance!', s: 10 },
      { t: 'The chosen one picks the next song (or hums one).' },
    ],
    teen: [
      { t: 'The chosen one tells everyone the initial of their crush, or sips.' },
      { t: 'The chosen one gets a new nickname from the group until the end.' },
    ],
    adult: [
      { t: 'The chosen one gives a 10-second shoulder massage to the person on their left.', s: 10 },
      { t: 'The chosen one picks someone to share a sip with, arms linked.' },
      { t: 'The chosen one whispers a flirty line to anyone they like.' },
    ],
  },
};

// Animal Match decks (secret animals). Women draw from FEMALE, men from MALE. Not the running animals.
export const DECKS = {
  female: [
    ['Bunny', '🐰'], ['Fawn', '🦌'], ['Swan', '🦢'], ['Butterfly', '🦋'], ['Ladybug', '🐞'], ['Dolphin', '🐬'],
    ['Koala', '🐨'], ['Panda', '🐼'], ['Flamingo', '🦩'], ['Unicorn', '🦄'], ['Hamster', '🐹'], ['Lamb', '🐑'],
    ['Seal', '🦭'], ['Peacock', '🦚'], ['Bee', '🐝'], ['Duckling', '🐤'], ['Parrot', '🦜'], ['Mouse', '🐭'],
  ],
  male: [
    ['Fox', '🦊'], ['Lion', '🦁'], ['Tiger', '🐯'], ['Wolf', '🐺'], ['Bear', '🐻'], ['Penguin', '🐧'],
    ['Owl', '🦉'], ['Otter', '🦦'], ['Monkey', '🐵'], ['Raccoon', '🦝'], ['Shark', '🦈'], ['Eagle', '🦅'],
    ['Frog', '🐸'], ['Dragon', '🐉'], ['Gorilla', '🦍'], ['Octopus', '🐙'], ['Turtle', '🐢'], ['Hedgehog', '🦔'],
  ],
};

// New timed items for every level (eye contact / slow dance etc.).
export const TIMED_EXTRA = {
  children: [{ type: 'dare', t: 'Have a 20-second staring contest with {who}. First to blink sips water.', h: 1, s: 20 }],
  teen: [{ type: 'dare', t: 'Hold eye contact with {who} for 20 seconds. No laughing!', h: 2, s: 20 }],
};

// One-time heat heuristic for existing bank rows (admin can edit afterwards).
const HOT = /\b(kiss|massage|slow dance|seductive|cuddle|lap|whisper|caress|stroke|neck|ear|thigh|first kiss|turn[- ]?on|attractive|flirt)/i;
const MILD = /\b(high-five|fist bump|joke|compliment|toast|accent|impression|air guitar|robot|nickname|squats|plank|coaster|game-show)/i;
export function guessHeat(text, level) {
  let h = level === 'children' ? 1 : 2;
  if (HOT.test(text)) h += 1;
  if (MILD.test(text)) h -= 1;
  return Math.max(1, Math.min(3, h));
}
export function guessSeconds(text) {
  const m = /\b(\d{1,3})\s*(?:-\s*)?seconds?\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 3 && n <= 300 ? n : null;
}
export function guessWhereHeat(name) {
  if (/\b(neck|ear|thigh)\b/.test(name)) return 3;
  if (/\b(hand|palm|finger|wrist|arm|elbow)/.test(name)) return 1;
  return 2;
}
