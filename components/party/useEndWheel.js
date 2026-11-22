'use client';
import { useCallback, useRef, useState } from 'react';
import { api } from '@/components/api';
import { load, save } from '@/components/party/store';
import { wheelOn } from '@/lib/gameSlots';

// v12b 🎡 SHARED END-OF-GAME STEP (every game whose slot in lib/gameSlots.js has wheel !== false — the default).
//   const end = useEndWheel('my-game');
//   start:   body.prev = end.prev(); then end.clear()    → server: last wheel winner (same group) = ⭐ Party Star
//   end:     end.finish({ order, room?, ticket? })        → ranking games (winner first)
//            end.show(room.wheel, { code, token })       → room-scored games (the server spun it at "end")
//   screen:  <EndWheel end={end} />                       → the animated wheel (StarWheel), or nothing
// Room games prove the next start with { code, token }; stateless games with the signed { ticket } from /api/wheel.
export default function useEndWheel(gameId) {
  const on = wheelOn(gameId);
  const key = `partygames.wheel.${gameId}`;
  const [wheel, setWheel] = useState(null);
  const busy = useRef(false);
  const prev = useCallback(() => (on ? load(key, null) : null), [on, key]);
  const show = useCallback((w, proof) => {
    if (!on || !w) return;
    setWheel(w);
    if (proof) save(key, proof);
  }, [on, key]);
  const finish = useCallback(async ({ order, room = null, ticket = null, players = null }) => {
    if (!on || busy.current || !order?.length) return;
    busy.current = true;
    try {
      if (room) {
        const d = await api(`/api/rooms/${room.code}/action`, { method: 'POST', body: { action: 'game_end', order }, headers: { 'x-room-token': room.token } });
        show(d.room?.wheel, { code: room.code, token: room.token });
      } else {
        const d = await api('/api/wheel', { method: 'POST', body: { game: gameId, order, ...(ticket ? { ticket } : { players }) } });
        show(d.wheel, { ticket: d.ticket });
      }
    } catch { busy.current = false; } // network hiccup → the next finish() may try again
  }, [on, gameId, show]);
  const reset = useCallback(() => { setWheel(null); busy.current = false; }, []);
  const clear = useCallback(() => save(key, null), [key]); // the next game started → the proof is used up
  return { on, wheel, prev, show, finish, reset, clear };
}
