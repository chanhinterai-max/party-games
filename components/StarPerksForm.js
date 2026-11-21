'use client';
import { STAR_FIELDS } from '@/lib/partystar-shared';

// v11: Party Star perks — a toggle + value(s) per perk. Used by the admin card and the session popup.
export default function StarPerksForm({ value, onChange, prefix = 'star' }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="star-perks">
      {STAR_FIELDS.map((f) => (
        <fieldset key={f.on} className={`star-perk ${value[f.on] ? '' : 'off'}`} data-perk={f.on}>
          <label className="star-perk-head">
            <input type="checkbox" name={`${prefix}-${f.on}`} checked={!!value[f.on]} onChange={(e) => set(f.on, e.target.checked)} />
            <span>{f.title}</span>
          </label>
          {f.vals.map((v) => (
            <label key={v.key} className="star-val">{v.label}
              <input className="input" type="number" inputMode="decimal" min={v.min} max={v.max} step={v.step} name={`${prefix}-${v.key}`}
                disabled={!value[f.on]} value={value[v.key]} onChange={(e) => set(v.key, e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
