// ANIMAL RACE — ALL TUNABLE CONSTANTS (client-side; no admin UI yet; each is a candidate admin setting).
// Times in ms, sizes in CSS px, progress q in 0..1 of the track. Every racer and role uses the same numbers.
export const RACE = {
  maxRacers: 4,              // racers per heat (4 thumbs on one phone)
  fgDprMax: 1.5,             // moving canvas pixel ratio cap (static background keeps 2): RULE ZERO, 60 fps
  stepsToGoal: 45,           // taps to reach the goal at 100% speed (Normal)
  maxTapsPerSec: 14,         // faster taps are ignored
  stopMs: 350,               // no tap for this long = safe (prey hide in a bush, predators sleep, Human crouches)
  smoothingMs: 70,           // visual easing toward the logical position after each tap
  countdownStepMs: 700,      // 3 · 2 · 1 · GO
  speedMin: 80, speedMax: 120, // per-animal speed % (pool editor); clamped again on the phone

  // ---- Tracks: one random curvy track per racer, ALL EXACTLY the same arc length, each crossing another.
  trackFactor: 1.5,          // track length = straight corner→goal distance × this (Normal)
  trackMax: 1.75,            // …or longer if the random curve needs it, up to this
  trackHalf: 13,             // half width of a track
  trackSamples: 240,         // arc-length resample points per track
  trackTries: 400,           // random layouts tried before relaxing the rules
  crossZone: [0.1, 0.86],    // a crossing only counts in this part of both tracks (not at start/goal)
  goalRadius: 40,
  buttonSize: 108,
  edgeMargin: 14,

  // ---- Racer crashes (both racers must be MOVING; hidden/sleeping racers can't crash)
  crashDist: 22,             // centre distance that counts as meeting
  crashMinQ: 0.06, crashMaxQ: 0.9, // no crashes right at the start pads or in the goal funnel
  loveCooldownMs: 10000,     // same pair can make another baby after this
  heartsMs: 1400,

  // ---- Covers (trees + bushes) and wild animals
  coversPerTrack: 2,         // EVERY track gets the same number of covers at the same progress bands (fairness)
  coverBands: [0.3, 0.62],   // progress along the owning track where its covers sit
  coverOffset: [44, 70],     // distance of a cover from its own track's centre line
  coverOtherMin: 58,         // and at least this far from every OTHER track (relaxed if the map is tight)
  coverRadius: 16,
  roamRadius: 78,            // wild animals wander within this distance of their cover
  wildRadius: 13,            // wild body radius used for keep-off-track checks
  gridCell: 6,               // keep-off-track grid resolution
  restMs: [900, 2600],       // time hidden in cover between outings
  outMs: [3800, 6500],       // time wandering before heading home
  wanderSpeed: 34,           // px/s at 100% speed
  maxWild: 18,               // hard cap on wild animals on screen (covers + babies)
  maxBabies: 6,              // hard cap on babies per race
  babyScale: 0.62,

  // ---- Vision cone ("telescope") + chase
  coneHalfDeg: 34,
  coneRange: 112,            // day
  coneRangeNight: 165,       // Adult night: wild animals see farther
  questionMs: 700,           // ❓ (racer moving inside the cone)
  approachMs: 1100, approachSpeed: 75, // slow approach
  sprintMs: 400, sprintSpeed: 360,     // sprint; contact at the end if the racer is still moving and close
  contactRange: 60,
  interestKeep: 1.2,         // cone range × this while already interested (hysteresis)
  wildCooldownMs: 1600,      // a wild animal ignores racers for this long after a chase

  // ---- Penalty (prey eaten / predator feast+rest / Human caught or distracted / predator–prey clash): identical
  penalty: { actionMs: 900, restMs: 1000, returnMs: 700 },

  // ---- Adult mode
  adult: {
    stepsToGoal: 90,         // longer race (2x Normal's taps)
    trackFactor: 1.85, trackMax: 2.3, // longer, curvier tracks (still all equal); always > Normal's max
    coversPerTrack: 3, coverBands: [0.24, 0.5, 0.76],
    firstSpellMs: [2500, 3500], // first change comes quickly so every race sees the sky change
    spellMs: [4000, 5500],   // each later day/night and weather spell lasts this long
    cueMs: 1500,             // the next spell's icon blinks this long before it starts
    nightDarkness: 0.62, lightRadius: 64,
    puddleQs: [0.2, 0.45, 0.7], // SAME progress on every track
    puddleSlide: 0.05,       // rain: slide back this share of the track (once per puddle per rain spell)
    puddleSlideMs: 450,
    lightningEveryMs: [1800, 2800], // during rain
    lightningWarnMs: 900,    // warning flicker ⚡
    freezeMs: 1300,          // everyone must freeze
    zapMs: 1500, zapSlide: 0.04, // tapping during the freeze: paused 1.5 s + slide back 4% (same for everyone)
    gustEveryMs: [1400, 2200], gustCueMs: 600, gustPush: 0.025, gustMs: 380, // wind: push everyone back 2.5%
    tripTapsPerSec: 8,       // night or rain: 3 taps in a row faster than this = trip
    tripRun: 3, tripMs: 1200,
    maxDrops: 60,            // rain particles cap
  },
};
export const penaltyTotal = (cfg = RACE) => cfg.penalty.actionMs + cfg.penalty.restMs + cfg.penalty.returnMs;
// Mode config: Adult overrides a few track/cover numbers.
export function modeCfg(mode, cfg = RACE) {
  if (mode !== 'adult') return { ...cfg, mode: 'normal' };
  const a = cfg.adult;
  return { ...cfg, mode: 'adult', stepsToGoal: a.stepsToGoal, trackFactor: a.trackFactor, trackMax: a.trackMax, coversPerTrack: a.coversPerTrack, coverBands: a.coverBands };
}
export const clampSpeed = (v, cfg = RACE) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(cfg.speedMin, Math.min(cfg.speedMax, n)) : 100; };
