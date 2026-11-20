// ANIMAL RACE — ALL TUNABLE CONSTANTS (client-side; no admin UI yet). Times in ms, sizes in CSS px.
// Every racer and role uses the same numbers, so the game stays fair.
export const RACE = {
  maxRacers: 4,              // racers per heat (4 thumbs on one phone)
  stepsToGoal: 45,           // taps to reach the goal with no penalty
  maxTapsPerSec: 14,         // faster taps are ignored (anti-spam, keeps it about thumbs not glitches)
  stopMs: 350,               // no tap for this long = safe (prey hide in a bush, predators sleep, Human crouches)
  smoothingMs: 70,           // visual easing toward the logical position after each tap

  countdownStepMs: 700,      // 3 · 2 · 1 · GO

  // Wild-animal disruptions: the SAME count for every lane, all spawning at the same random moments.
  disruptions: 3,            // per lane per race
  firstDisruptionMs: [1500, 2600], // first spawn window after GO
  disruptionGapMs: [2800, 4000],   // gap between spawns
  noticeJitterMs: 700,       // per-lane random delay before a wild animal starts watching (varies the feel)
  lurkMs: 2200,              // it watches a still racer this long, then wanders off
  questionMs: 700,           // ❓ stage (racer moving)
  approachMs: 1100,          // slow approach stage
  approachFrac: 0.45,        // share of the distance covered during the slow approach
  sprintMs: 400,             // sprint stage; contact at the end if the racer is still moving
  leaveMs: 650,              // wander-off animation

  // Getting caught (prey eaten / predator eats & rests / Human caught or distracted): identical for all.
  penalty: { actionMs: 900, restMs: 1000, returnMs: 700 },

  // Board geometry
  goalRadius: 44,
  buttonSize: 108,
  laneHalfWidth: 24,
  wildRadius: 20,
  contactOffset: 48,         // a wild animal stops BESIDE the racer (never on any lane)
  spawnOffset: 92,
};
export const penaltyTotal = (cfg = RACE) => cfg.penalty.actionMs + cfg.penalty.restMs + cfg.penalty.returnMs;
