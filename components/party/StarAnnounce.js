// v12: the Party Star perk list as a small COLLAPSED dropdown ("⭐ <label>: Mia ▸"), shown to everyone at the bottom
// of the start screen and kept available during the game. Native <details>: no JS, no re-render cost.
export default function StarAnnounce({ star }) {
  if (!star) return null;
  return (
    <details className="star-drop" data-star-drop>
      <summary>⭐ {star.label}: <b data-star-name>{star.player}</b>{star.round > 1 ? <small> · picked by the wheel</small> : null}</summary>
      {star.list?.length ? <ul>{star.list.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="count">No perks are switched on.</p>}
    </details>
  );
}
