import GenderDot from '@/components/GenderDot';

// v13 SHARED "who": the player's animal emoji + name (Truth or Dare pairs, cards, surprises, results, live view).
// Falls back to the blue/pink gender dot when the player has no animal (older rooms).
export default function PlayerTag({ name, animals, genders, bold = false }) {
  const a = animals?.[name];
  const N = bold ? <b>{name}</b> : name;
  return (
    <span className="ptag" data-ptag={name}>
      {a?.emoji ? <span className="ptag-emoji" role="img" aria-label={a.name || 'animal'} data-ptag-animal={a.id || a.name}>{a.emoji}</span> : <GenderDot gender={genders?.[name]} />}{N}
    </span>
  );
}

// Text with the first occurrence of `name` shown as a PlayerTag (card texts that name a player).
export function WithTag({ text, name, animals, genders }) {
  if (!name) return text;
  const i = text.indexOf(name);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<PlayerTag name={name} animals={animals} genders={genders} />{text.slice(i + name.length)}</>;
}
