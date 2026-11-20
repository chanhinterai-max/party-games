'use client';
import GenderDot from '@/components/GenderDot';

// SHARED (Truth or Dare + Animal Race): open list of players with gender dot, animal and role.
export const ROLE_LABEL = { predator: '🦷 Predator', prey: '🌿 Prey', human: '🧍 Human', animal: '🐾 Animal' };
// v6: everyone plays on one screen, so animals are shown openly (no private reveal).
export default function AnimalList({ players, animals, genders }) {
  return (
    <ul className="animal-list">
      {players.map((p) => {
        const a = animals?.[p];
        return (
          <li key={p} className={`animal-row role-${a?.role || 'animal'}`} data-animal-row={p} data-role={a?.role || ''} data-animal-id={a?.id || ''}>
            <span className="animal-emoji" aria-hidden="true">{a?.emoji || '🐾'}</span>
            <span className="animal-who"><b><GenderDot gender={genders?.[p]} />{p}</b><small data-animal-name>{a?.name || 'Mystery'}</small></span>
            <span className={`role-tag ${a?.role || ''}`}>{ROLE_LABEL[a?.role] || ROLE_LABEL.animal}</span>
          </li>
        );
      })}
    </ul>
  );
}

