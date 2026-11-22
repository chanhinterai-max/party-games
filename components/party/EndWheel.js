'use client';
import StarWheel from '@/components/party/StarWheel';

// v12b: the end-of-game wheel slot every game page renders (see useEndWheel). Nothing until the server has spun.
export default function EndWheel({ end, label }) {
  if (!end?.wheel) return null;
  return <StarWheel key={end.wheel.winner + (end.wheel.slices?.length || 0)} wheel={end.wheel} label={end.wheel.label || label} />;
}
