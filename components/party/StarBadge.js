// v11: the ⭐ badge shown next to the Party Star everywhere (Animals box, race lanes, results). Not hideable.
export default function StarBadge({ label, short = false }) {
  return <span className="star-badge" data-star-badge title={label}>⭐{short ? '' : ` ${label}`}</span>;
}
