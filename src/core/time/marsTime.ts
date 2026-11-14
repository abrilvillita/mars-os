/**
 * Mars time & sun position — Mars24 algorithm (Allison & McEwen 2000, Planet. Space Sci. 48;
 * NASA GISS Mars24 technical notes). Accurate to ~0.01° in Ls for 1950–2050.
 *
 * Validated in this repo against the Perseverance MEDA feed: for 2024-04-27 the feed lists
 * sol 1133 and Ls 244.106 (see docs/ARCHITECTURE.md).
 */
const D = Math.PI / 180;
const sinD = (x: number) => Math.sin(x * D);
const cosD = (x: number) => Math.cos(x * D);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** TAI−UTC (leap seconds), IERS Bulletin C. 37 s since 2017-01-01 (no leap second added since). */
const LEAP: [number, number][] = [
  [Date.UTC(2017, 0, 1), 37], [Date.UTC(2015, 6, 1), 36], [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2009, 0, 1), 34], [Date.UTC(2006, 0, 1), 33], [Date.UTC(1999, 0, 1), 32], [Date.UTC(1997, 6, 1), 31],
];
const taiUtc = (ms: number) => LEAP.find(([t]) => ms >= t)?.[1] ?? 30;

export interface MarsTime {
  jdUT: number;
  jdTT: number;
  /** Mars Sol Date */
  msd: number;
  /** Coordinated Mars Time (mean solar time at the prime meridian), hours */
  mtc: number;
  /** Areocentric solar longitude, degrees */
  ls: number;
  /** Mars Year (Clancy et al. convention, MY1 began 1955-04-11) */
  marsYear: number;
  /** Equation of time, degrees */
  eot: number;
  /** Subsolar point (planetocentric lat, east lon) */
  subsolarLat: number;
  subsolarLon: number;
  /** Heliocentric distance, AU */
  sunDistanceAU: number;
}

export function marsTime(date: Date): MarsTime {
  const jdUT = 2440587.5 + date.getTime() / 86400000;
  const jdTT = jdUT + (taiUtc(date.getTime()) + 32.184) / 86400;
  const dt = jdTT - 2451545.0;
  const M = mod(19.3871 + 0.52402073 * dt, 360);
  const aFMS = mod(270.3871 + 0.524038496 * dt, 360);
  const A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.002, 0.0018];
  const tau = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
  const phi = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
  let pbs = 0;
  for (let i = 0; i < 7; i++) pbs += A[i] * cosD((0.985626 * dt) / tau[i] + phi[i]);
  const vM =
    (10.691 + 3.0e-7 * dt) * sinD(M) + 0.623 * sinD(2 * M) + 0.05 * sinD(3 * M) + 0.005 * sinD(4 * M) + 0.0005 * sinD(5 * M) + pbs;
  const ls = mod(aFMS + vM, 360);
  const eot = 2.861 * sinD(2 * ls) - 0.071 * sinD(4 * ls) + 0.002 * sinD(6 * ls) - vM;
  const msd = (jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const mtc = mod(24 * msd, 24);
  const subsolarWest = mod(mtc * 15 + eot + 180, 360);
  const subsolarLon = mod(-subsolarWest + 180, 360) - 180; // to east-positive [-180,180)
  const subsolarLat = Math.asin(0.42565 * sinD(ls)) / D + 0.25 * sinD(ls);
  const sunDistanceAU = 1.5236 * (1.00436 - 0.09309 * cosD(M) - 0.004336 * cosD(2 * M) - 0.00031 * cosD(3 * M) - 0.00003 * cosD(4 * M));
  // Mars Year: MY1 started at Ls 0 on 1955-04-11. Approximate by orbital period of 686.9725 days, corrected by Ls.
  const daysSince = jdUT - 2435208.5; // 1955-04-11
  let marsYear = 1 + Math.floor(daysSince / 686.9725);
  const lsAtYearStartGuess = mod(daysSince, 686.9725) / 686.9725 * 360;
  if (lsAtYearStartGuess < 30 && ls > 330) marsYear -= 1;
  else if (lsAtYearStartGuess > 330 && ls < 30) marsYear += 1;
  return { jdUT, jdTT, msd, mtc, ls, marsYear, eot, subsolarLat, subsolarLon, sunDistanceAU };
}

/** Local Mean Solar Time (hours) at an east longitude. */
export function lmst(t: MarsTime, lonEast: number) {
  return mod(t.mtc + lonEast / 15, 24);
}

/** Local True Solar Time (hours) at an east longitude. */
export function ltst(t: MarsTime, lonEast: number) {
  return mod(lmst(t, lonEast) + t.eot / 15, 24);
}

/** Mission sol number for a lander at lonEast whose sol 0 contained `landingUTC` (LMST-based). */
export function missionSol(t: MarsTime, landingUTC: Date, lonEast: number) {
  const land = marsTime(landingUTC);
  return Math.floor(t.msd + lonEast / 360) - Math.floor(land.msd + lonEast / 360);
}

export const PERSEVERANCE = {
  landingUTC: new Date('2021-02-18T20:55:00Z'),
  lonEast: 77.45088573,
};

/** Northern-hemisphere season name key by Ls. */
export function seasonKey(ls: number, lat = 1): 'spring' | 'summer' | 'autumn' | 'winter' {
  const north = ls < 90 ? 'spring' : ls < 180 ? 'summer' : ls < 270 ? 'autumn' : 'winter';
  if (lat >= 0) return north;
  return ({ spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' } as const)[north];
}

export function formatHours(h: number) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.floor(((h - hh) * 60 - mm) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
