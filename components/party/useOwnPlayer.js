'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { blank } from './store';

// v14: in a host room (?host=1) the signed-in advanced user joins as the FIRST player with their game name (locked row).
// The server re-checks it (own player = the creator's game name, linked by account id) and deals their favourite animal.
export default function useOwnPlayer(host, setPlayers) {
  const [me, setMe] = useState(null); // { gameName, avatar, favAnimal }
  useEffect(() => {
    if (!host) return undefined;
    let live = true;
    api('/api/me/profile').then((d) => {
      if (!live || !d.gameName) return;
      setMe(d);
      const key = d.gameName.toLowerCase();
      setPlayers((ps) => {
        const old = ps.find((p) => p.name.trim().toLowerCase() === key);
        const rest = ps.filter((p) => p.name.trim().toLowerCase() !== key && !p.own);
        return [{ name: d.gameName, gender: old?.gender || ps.find((p) => p.own)?.gender || '', own: true }, ...(rest.length ? rest : [blank()])];
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [host]); // eslint-disable-line react-hooks/exhaustive-deps
  return me;
}
