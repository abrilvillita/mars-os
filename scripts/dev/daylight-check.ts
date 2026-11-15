// Sanity check of daylight at Jezero against the MEDA feed's published sunrise/sunset (sol 1133, 2024-04-27: 06:18:07 / 17:13:51 LMST).
import { daylightAt } from '../../src/core/time/daylight';
import { marsTime, PERSEVERANCE, lmst } from '../../src/core/time/marsTime';
const t = marsTime(new Date('2024-04-27T12:00:00Z'));
const d = daylightAt(t, 18.4446, PERSEVERANCE.lonEast);
const eotH = t.eot / 15; // LTST = LMST + EOT
console.log('Ls', t.ls.toFixed(1), 'sunrise LMST', (d.sunriseH! - eotH).toFixed(3), 'sunset LMST', (d.sunsetH! - eotH).toFixed(3), '| MEDA: 6.302 / 17.231', 'lmst now', lmst(t, PERSEVERANCE.lonEast).toFixed(2));
