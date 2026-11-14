/**
 * MARS OS DATA CONTRACT — shared primitives.
 *
 * Conventions (apply to every document):
 *  - Coordinates are PLANETOCENTRIC latitude and EAST-POSITIVE longitude in decimal degrees,
 *    longitude domain [-180, 180]. Reference body: IAU 2015 Mars sphere (IAU_2015:49900).
 *  - Lengths are meters, elevations are meters relative to the MOLA areoid unless stated.
 *  - Dates are ISO-8601 strings in UTC.
 *  - Unknown values are `null`. NEVER fill a missing measurement with a guess.
 *  - Anything not observed/derived from a real product MUST set `synthetic: true`.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0' as const;

/** Stable identifier: lowercase, dot/colon/dash/underscore separated. Never reused for other content. */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/, 'lowercase id: [a-z0-9] then [a-z0-9._:/-]')
  .max(160)
  .describe('Stable identifier. Once published, an id always refers to the same entity.');

export const IsoDate = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/, 'ISO-8601 date or datetime')
  .describe('ISO-8601 date or UTC datetime. Reduced precision (YYYY or YYYY-MM) is allowed: never invent a day.');

export const Latitude = z.number().min(-90).max(90).describe('Planetocentric latitude, degrees');
export const Longitude = z.number().min(-180).max(180).describe('East-positive longitude, degrees, [-180,180]');

export const LatLon = z
  .object({
    lat: Latitude,
    lon: Longitude,
    elevation_m: z.number().nullable().optional().describe('Meters relative to MOLA areoid; null if unknown'),
  })
  .describe('Geographic position on Mars');

export const BBox = z
  .object({ west: Longitude, south: Latitude, east: Longitude, north: Latitude })
  .refine((b) => b.north >= b.south, 'north must be >= south')
  .describe('Geographic bounding box. If west > east the box crosses the 180° meridian.');

/** Localized free text. `en` is mandatory (default UI language); other BCP-47 keys optional. */
export const LocalizedText = z
  .object({ en: z.string().min(1) })
  .catchall(z.string())
  .describe('Translations keyed by BCP-47 language code. "en" is required.');

export const Crs = z
  .enum(['IAU_2015:49900', 'EPSG:104905', 'IAU_2015:49910', 'other'])
  .describe(
    'IAU_2015:49900 = Mars 2000 sphere, planetocentric geographic (default). EPSG:104905 = ESRI GCS_Mars_2000_Sphere (Mars Trek EQ). IAU_2015:49910 = Mars equirectangular projection.',
  );

/**
 * Provenance class — the most important field for scientific honesty.
 *  measured     direct instrument observation (raw/calibrated)
 *  derived      product processed from measurements (mosaic, DEM, map, index)
 *  interpreted  expert interpretation (e.g. geologic unit map)
 *  modeled      numerical model output (e.g. climate model)
 *  generated    produced by MARS OS itself (mesh, tessellation, interpolation)
 *  ai_proposed  change suggested by an AI engine, NOT yet a fact
 *  human_edit   manual change by a team member
 *  synthetic    simulated / demo / placeholder content
 */
export const Provenance = z.enum([
  'measured',
  'derived',
  'interpreted',
  'modeled',
  'generated',
  'ai_proposed',
  'human_edit',
  'synthetic',
]);

export const Uncertainty = z
  .object({
    horizontal_m: z.number().nonnegative().nullable().describe('1-sigma horizontal uncertainty, meters; null if unknown'),
    vertical_m: z.number().nonnegative().nullable().describe('1-sigma vertical uncertainty, meters; null if unknown'),
    notes: z.string().nullable().optional(),
  })
  .describe('Known uncertainty. Use null when the source does not state it.');

export const TimeRange = z
  .object({ start: IsoDate.nullable(), end: IsoDate.nullable() })
  .describe('Acquisition / validity period; null bounds when unknown');

export const Resolution = z
  .object({
    metersPerPixel: z.number().positive().nullable().describe('Nominal ground sampling distance'),
    pixelsPerDegree: z.number().positive().nullable().optional(),
    mapScale: z.string().nullable().optional().describe('e.g. "1:20,000,000" for vector maps'),
  })
  .describe('Native resolution of the ORIGINAL product (not of any resampled copy)');

export type LatLonT = z.infer<typeof LatLon>;
export type BBoxT = z.infer<typeof BBox>;
export type LocalizedTextT = z.infer<typeof LocalizedText>;
export type ProvenanceT = z.infer<typeof Provenance>;
export type UncertaintyT = z.infer<typeof Uncertainty>;
export type ResolutionT = z.infer<typeof Resolution>;
export type TimeRangeT = z.infer<typeof TimeRange>;
