/**
 * Mission Lab model (pure logic). Every number is either MEASURED at the site (elevation,
 * slope, ice/dune/mineral distances), COMPUTED from physics (sunlight, Earth–Mars distance and
 * light time, solar conjunction), or an ASSUMPTION the user can edit — each value says which.
 *
 * Constants and their sources:
 *  - crew oxygen 0.84 kg per person per day — NASA Baseline Values and Assumptions Document (BVAD)
 *  - MOXIE peak production about 12 g O2 per hour — NASA Perseverance MOXIE results
 *  - surface radiation 0.64 ± 0.12 mSv/day at Gale — MSL RAD, Hassler et al. 2014 (catalog value)
 *  - cruise radiation about 1.8 mSv/day — MSL RAD during cruise, Zeitlin et al. 2013
 *  - NASA career effective dose limit 600 mSv — NASA-STD-3001 (2022)
 *  - MMRTG about 110 W electrical at launch — NASA
 *  - solar constant 1361 W/m² at 1 AU
 *  - Earth/Mars orbits: JPL approximate Keplerian elements (Standish), valid 1800–2050
 */
import { DEG } from '../geo/mars';

export const CONST = {
  o2KgPerPersonDay: 0.84,
  moxieGPerHour: 12,
  surfaceMSvDay: 0.64,
  cruiseMSvDay: 1.8,
  careerLimitMSv: 600,
  mmrtgW: 110,
  solarConstant: 1361,
  solHours: 24.6597,
  armstrongPa: 6250,
} as const;

// ── Earth–Mars geometry (JPL approximate elements, J2000 ecliptic) ──
const EL = {
  earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  mars: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
} as const;

function helio(body: keyof typeof EL, jd: number): [number, number, number] {
  const T = (jd - 2451545) / 36525;
  const e0 = EL[body];
  const a = e0[0] + e0[1] * T, e = e0[2] + e0[3] * T, I = (e0[4] + e0[5] * T) * DEG, L = e0[6] + e0[7] * T, w = e0[8] + e0[9] * T, O = e0[10] + e0[11] * T;
  const om = (w - O) * DEG;
  const M = ((((L - w) % 360) + 540) % 360 - 180) * DEG;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const Or = O * DEG, co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Or), sO = Math.sin(Or), cI = Math.cos(I), sI = Math.sin(I);
  return [(co * cO - so * sO * cI) * x + (-so * cO - co * sO * cI) * y, (co * sO + so * cO * cI) * x + (-so * sO + co * cO * cI) * y, so * sI * x + co * sI * y];
}

const jdOf = (ms: number) => ms / 86400000 + 2440587.5;

/** Earth–Mars distance (AU), one-way light time (min) and Sun–Earth–Mars angle (deg). */
export function earthLink(ms: number) {
  const j = jdOf(ms);
  const E = helio('earth', j), M = helio('mars', j);
  const r = [M[0] - E[0], M[1] - E[1], M[2] - E[2]];
  const d = Math.hypot(r[0], r[1], r[2]);
  const elong = Math.acos(-(E[0] * r[0] + E[1] * r[1] + E[2] * r[2]) / (Math.hypot(E[0], E[1], E[2]) * d)) / DEG;
  return { au: d, lightMin: (d * 149597870.7) / 299792.458 / 60, elongDeg: elong };
}

/** Days within [start, start+days] when the Sun is closer than 3° to Mars as seen from Earth. */
export function conjunctionDays(startMs: number, days: number) {
  const out: number[] = [];
  for (let k = 0; k <= days; k++) if (earthLink(startMs + k * 86400000).elongDeg < 3) out.push(k);
  return out;
}

/** Daily-mean sunlight at the top of the atmosphere (W/m²) for a latitude, solar declination and Sun distance. */
export function dailyInsolationTOA(latDeg: number, declDeg: number, sunAU: number) {
  const S = CONST.solarConstant / (sunAU * sunAU);
  const phi = latDeg * DEG, d = declDeg * DEG;
  const c = -Math.tan(phi) * Math.tan(d);
  const h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
  return (S / Math.PI) * (h0 * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(h0));
}

export interface MissionInputs {
  kind: 'crew' | 'rover' | 'base';
  crew: number;
  days: number;
  evaHours: number;
  reservePct: number;
  walkKmh: number;
  powerKw: number;
  tau: number;
  panelEff: number;
  roverPower: 'rtg' | 'solar';
  panelM2: number;
}

export const DEFAULT_INPUTS: MissionInputs = { kind: 'crew', crew: 4, days: 30, evaHours: 6, reservePct: 30, walkKmh: 3, powerKw: 10, tau: 0.5, panelEff: 0.25, roverPower: 'rtg', panelM2: 1.3 };

export function oxygenNeeds(i: MissionInputs) {
  const perDay = i.crew * CONST.o2KgPerPersonDay;
  const total = perDay * i.days;
  const moxiePerDay = (CONST.moxieGPerHour * CONST.solHours) / 1000;
  return { perDay, total, moxieUnits: perDay / moxiePerDay };
}

export function radiation(days: number, transitDays = 0) {
  const surface = days * CONST.surfaceMSvDay;
  const cruise = transitDays * CONST.cruiseMSvDay;
  return { surface, cruise, total: surface + cruise, limitShare: (surface + cruise) / CONST.careerLimitMSv };
}

/** Solar power: average surface sunlight (rough dust attenuation e^-tau) and array area for a power demand. */
export function solar(latDeg: number, declDeg: number, sunAU: number, i: MissionInputs) {
  const toa = dailyInsolationTOA(latDeg, declDeg, sunAU);
  const surface = toa * Math.exp(-i.tau);
  const areaM2 = surface > 0 ? (i.powerKw * 1000) / (surface * i.panelEff) : Infinity;
  const roverWh = surface * i.panelM2 * i.panelEff * CONST.solHours;
  return { toa, surface, areaM2, roverWh };
}

/** EVA exploration radius (km): out and back within the EVA, keeping a safety reserve. */
export function evaRadiusKm(i: MissionInputs) {
  return (i.walkKmh * i.evaHours * (1 - i.reservePct / 100)) / 2;
}

/** Surface pressure from elevation (scale-height model, 610 Pa at 0 m; H = 11.1 km). */
export const pressureAt = (hM: number) => 610 * Math.exp(-hM / 1000 / 11.1);
