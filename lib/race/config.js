// ANIMAL RACE — ALL TUNABLE CONSTANTS (client-side; no admin UI yet; each is a candidate admin setting).
// Times in ms, sizes in CSS px, progress q in 0..1 of the track. Every racer and role uses the same numbers.
export const RACE = {
  maxRacers: 4,              // racers per heat (4 thumbs on one phone)
  fgDprMax: 1.5,             // moving canvas pixel ratio cap (static background keeps 2): RULE ZERO, 60 fps
  stepsToGoal: 45,           // taps to reach the goal at 100% speed (Normal)
  maxTapsPerSec: 14,         // faster taps are ignored
  stopMs: 350,               // no tap for this long = hidden in a bush (every role) = safe from hunters
  smoothingMs: 70,           // visual easing toward the logical position after each tap
  countdownStepMs: 750,      // 3 · 2 · 1 · GO
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

  // ---- Racer crashes (both racers must be MOVING; hidden racers can't crash)
  crashDist: 22,             // centre distance that counts as meeting
  crashMinQ: 0.06, crashMaxQ: 0.9, // no crashes right at the start pads or in the goal funnel
  loveCooldownMs: 10000,     // same pair can make another baby after this
  heartsMs: 1400,

  crossShift: [38, 66],      // v9: crossing points sit this far off the centre lines (see geometry.js)
  layoutBudgetMs: 900,       // time for the offset-crossing search before the symmetric fallback (runs in a worker)
  wiggleEnv: [0.5, 1],       // free wiggle strength at the start → end of a track
  crossOffsetPx: 34,         // …so the two tracks of a planned crossing reach it ≥ this many px apart (> crashDist)

  // ---- Covers (trees + bushes): hunters come out of them
  coversPerTrack: 2,         // EVERY track gets the same number of covers at the same progress + distance (fairness)
  coverBands: [0.3, 0.62],   // progress along the owning track where its covers sit
  coverOffset: [44, 70],     // distance of a cover from its own track's centre line
  coverOtherMin: 58,         // and at least this far from every OTHER track (relaxed if the map is tight)
  coverRadius: 16,
  roamRadius: 78,            // hunters wander within this distance of their cover
  hunterRadius: 13,          // hunter body radius used for keep-off-track checks (hunters NEVER step on a track)
  gridCell: 6,               // keep-off-track grid resolution

  // ---- Hunters (🤠). Waves arrive at the SAME times for everyone: wave k = one hunter per track, from that
  // track's mirrored cover (band k % bands), at hunterFirstMs + k × hunterEveryMs after GO, up to the cap.
  hunterFirstMs: 1500, hunterEveryMs: 7000, hunterMaxPerTrack: 2, maxHunters: 12,
  hunterArriveCueMs: 1200,   // "🤠 hunter arrives" cue (bush shakes + banner) before each wave
  wanderSpeed: 30,           // px/s
  pauseMs: [500, 1400],      // looking around between roam points
  stalkSpeed: 42,            // px/s walking toward a spotted moving racer (never onto a track)
  coneHalfDeg: 30,           // spotlight cone
  coneRange: 125,            // day
  coneRangeNight: 175,       // Adult night: longer, glowing spotlight
  interestKeep: 1.2,         // cone range/angle × this while already aiming (hysteresis)
  aimMs: 650,                // red laser "tell" before every shot (target must keep moving inside the cone)
  shotGapMs: 500,            // pause after a shot before the next aim
  hunterCooldownMs: 1500,    // after losing a target (it hid / left the cone) the hunter ignores racers this long
  touchRange: 34,            // hunter within this of a MOVING racer = instant kill (hunter stays off the track band)
  tracerMs: 260,             // bullet streak + muzzle flash + impact

  // ---- Health (every racer, every role, same rules)
  health: 100,
  dmgClose: 55, dmgCloseDist: 45, // shot from ≤ 45 px: 55 damage → 2 shots kill
  dmgFar: 34,                // at the edge of the spotlight: 34 damage → 3 shots kill (linear in between)
  regenDelayMs: 1800,        // no regen for this long after a hit
  regenPerSec: 7,            // then health grows back slowly to full

  // ---- Babies (love match): follow their parent along its track; one baby absorbs one shot (poof)
  maxBabies: 6,              // hard cap on babies per race
  babyScale: 0.62,
  babyGap: 20,               // px behind the parent (and the previous baby)
  poofMs: 650,

  // ---- Countdown + haptics (navigator.vibrate where supported; silently ignored on iOS)
  countdownAnimals: ['🐢', '🐇', '🐆'], // 3 · 2 · 1, then GO! (taps before GO are ignored)
  haptics: { tapMs: 8, tapEveryMs: 120, hitMs: 45, death: [90, 60, 90, 60, 180], finish: [60, 40, 60, 40, 240], freeze: [140, 90, 140], go: 30 },

  // ---- Penalty (shot dead / touched by a hunter / predator–prey clash): identical for every kind and role
  penalty: { actionMs: 900, restMs: 1000, returnMs: 700 },

  // ---- Adult mode
  adult: {
    stepsToGoal: 90,         // longer race (2x Normal's taps)
    trackFactor: 1.85, trackMax: 2.3, // longer, curvier tracks (still all equal); always > Normal's max
    coversPerTrack: 3, coverBands: [0.24, 0.5, 0.76],
    hunterEveryMs: 6000, hunterMaxPerTrack: 3, // longer race: one more hunter wave
    layoutBudgetMs: 1500,    // curvier maps take longer to find (computed in a worker while you look at the results)
    firstSpellMs: [2500, 3500], // first change comes quickly so every race sees the sky change
    spellMs: [4000, 5500],   // each later day/night and weather spell lasts this long
    cueMs: 1500,             // the next spell's icon blinks this long before it starts
    nightDarkness: 0.62, lightRadius: 64,
    puddleQs: [0.2, 0.45, 0.7], // SAME progress on every track
    puddleSlide: 0.05,       // rain: slide back this share of the track (once per puddle per rain spell)
    puddleSlideMs: 450,
    lightningEveryMs: [1800, 2800], // during rain
    lightningWarnMs: 1700,   // big ⚡ FREEZE! warning + tint + vibration this long before the freeze
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
  return { ...cfg, mode: 'adult', stepsToGoal: a.stepsToGoal, trackFactor: a.trackFactor, trackMax: a.trackMax, coversPerTrack: a.coversPerTrack, coverBands: a.coverBands, hunterEveryMs: a.hunterEveryMs, hunterMaxPerTrack: a.hunterMaxPerTrack, layoutBudgetMs: a.layoutBudgetMs };
}
export const clampSpeed = (v, cfg = RACE) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(cfg.speedMin, Math.min(cfg.speedMax, n)) : 100; };
