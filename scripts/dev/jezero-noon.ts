// Finds a UTC time on 2026-11-14 when Local True Solar Time at Jezero is ~13:30 (for well-lit captures).
import { ltst, marsTime, PERSEVERANCE } from '../../src/core/time/marsTime';
const start = Date.parse('2026-11-14T00:00:00Z');
let best = 0, bestErr = 99;
for (let m = 0; m < 26 * 60; m++) {
  const t = marsTime(new Date(start + m * 60000));
  const err = Math.abs(ltst(t, PERSEVERANCE.lonEast) - 13.5);
  if (err < bestErr) { bestErr = err; best = start + m * 60000; }
}
console.log(new Date(best).toISOString(), 'LTST err h', bestErr.toFixed(3));
