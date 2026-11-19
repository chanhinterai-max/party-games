export default function GenderDot({ gender }) {
  if (gender !== 'male' && gender !== 'female') return null;
  return <span className={`gdot ${gender}`} role="img" aria-label={gender === 'male' ? 'male' : 'female'} />;
}

// Render text with the first occurrence of `name` highlighted with a gender dot.
export function WithDot({ text, name, gender }) {
  if (!name || !gender) return text;
  const i = text.indexOf(name);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="who-tag"><GenderDot gender={gender} />{name}</span>
      {text.slice(i + name.length)}
    </>
  );
}
