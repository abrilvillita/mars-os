/**
 * Daylight at a place on Mars from the Mars24 sun position.
 * Geometric sunrise/sunset (Sun's centre on a flat horizon): ignores terrain shading,
 * atmospheric refraction and twilight — labelled as such in the UI.
 */
import { DEG } from '../geo/mars';
import { ltst, type MarsTime } from './marsTime';

/** One Mars "hour" (1/24 sol) in Earth hours. Sol = 88,775.244 s. */
export const MARS_HOUR_IN_EARTH_H = 88775.244 / 86400;

export interface Daylight {
  ltstH: number; // local true solar time now, Mars hours
  sunElevDeg: number;
  sunriseH: number | null; // LTST, null in polar day/night
  sunsetH: number | null;
  polar: 'day' | 'night' | null;
  isDay: boolean;
  /** Earth hours of daylight remaining from now (0 at night). */
  remainingEarthH: number;
}

export function daylightAt(t: MarsTime, lat: number, lon: number): Daylight {
  const now = ltst(t, lon);
  const phi = lat * DEG, dec = t.subsolarLat * DEG;
  const H = (now - 12) * 15 * DEG; // hour angle
  const sunElevDeg = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / DEG;
  const c = -Math.tan(phi) * Math.tan(dec);
  if (c <= -1 || c >= 1) {
    const polar = c <= -1 ? 'day' : 'night';
    return { ltstH: now, sunElevDeg, sunriseH: null, sunsetH: null, polar, isDay: polar === 'day', remainingEarthH: polar === 'day' ? 24 * MARS_HOUR_IN_EARTH_H : 0 };
  }
  const H0 = Math.acos(c) / DEG / 15; // hours
  const sunriseH = 12 - H0, sunsetH = 12 + H0;
  const isDay = now > sunriseH && now < sunsetH;
  return { ltstH: now, sunElevDeg, sunriseH, sunsetH, polar: null, isDay, remainingEarthH: isDay ? (sunsetH - now) * MARS_HOUR_IN_EARTH_H : 0 };
}
