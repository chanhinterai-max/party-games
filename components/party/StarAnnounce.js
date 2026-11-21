// v11: start-of-game announcement, shown to everyone on the shared screen: "⭐ Party Star: <name>" + the
// plain list of active perks. Rendered at the start of every Party Star game (and kept as a small strip).
export default function StarAnnounce({ star, compact = false }) {
  if (!star) return null;
  if (compact) return <p className="star-strip" data-star-strip>⭐ {star.label}: <b>{star.player}</b></p>;
  return (
    <section className="star-announce" data-star-announce role="status">
      <h3>⭐ {star.label}: <span data-star-name>{star.player}</span></h3>
      {star.list?.length ? (
        <ul>{star.list.map((x) => <li key={x}>{x}</li>)}</ul>
      ) : <p className="count">No perks are switched on.</p>}
      <p className="count">Anything a perk produces is marked “⭐ {star.label}’s pick”.</p>
    </section>
  );
}
