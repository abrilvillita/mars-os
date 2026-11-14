/**
 * MARS OS DATA CONTRACT — scientific catalog (ORIGINAL data only).
 *
 * A MarsCatalog document lists sources, layers, regions and features that come from
 * NASA / USGS / ESA / peer-reviewed products. It must never contain AI proposals or edits:
 * those live in a separate TerrainChangeLog document (see changes.ts).
 */
import { z } from 'zod';
import {
  BBox, Crs, Id, IsoDate, LatLon, LocalizedText, Provenance, Resolution, SCHEMA_VERSION, TimeRange, Uncertainty,
} from './primitives';

/** Citation-grade reference to a dataset, product, publication or API. */
export const Source = z
  .object({
    id: Id,
    title: z.string().describe('Official product/dataset title. Do not translate.'),
    kind: z.enum(['dataset', 'tile_service', 'api', 'publication', 'map', 'mission_page']),
    agency: z.string().nullable().describe('e.g. "NASA/JPL-Caltech", "USGS Astrogeology", "ESA"'),
    mission: z.string().nullable().describe('Official mission name, e.g. "Mars Reconnaissance Orbiter"'),
    instrument: z.string().nullable().describe('Official instrument name/acronym, e.g. "HiRISE"'),
    productId: z.string().nullable().describe('Archive product id / layer id'),
    datasetId: z.string().nullable().describe('PDS DATA_SET_ID or equivalent'),
    doi: z.string().nullable(),
    url: z.string().url().describe('Direct link to the data or service'),
    landingPage: z.string().url().nullable(),
    citation: z.string().nullable().describe('Recommended citation text'),
    license: z.string().nullable().describe('Usage terms as stated by the provider'),
    acquisition: TimeRange.nullable(),
    publishedAt: IsoDate.nullable(),
    accessedAt: IsoDate.nullable().describe('When the team last verified the link'),
    provenance: Provenance.exclude(['ai_proposed', 'human_edit']),
    synthetic: z.boolean().default(false),
    notes: z.string().nullable().optional(),
  })
  .describe('A citable origin of data');

/** How the client fetches a layer. */
export const LayerAccess = z.discriminatedUnion('protocol', [
  z.object({
    protocol: z.literal('wmts'),
    urlTemplate: z.string().describe('Placeholders {z} {row} {col}. Mars Trek EQ: root matrix is 2x1 tiles of 256 px.'),
    tileMatrixSet: z.enum(['trek-eq-2x1']).describe('Equirectangular quadtree, z0 = 2 cols x 1 row'),
    format: z.enum(['image/jpeg', 'image/png']),
    tileSize: z.number().int().positive(),
    minZoom: z.number().int().min(0),
    maxZoom: z.number().int().min(0),
    fallback: z
      .object({
        urlTemplate: z.string().describe('Local copy, same placeholders'),
        maxZoom: z.number().int().min(0),
      })
      .nullable()
      .describe('Offline copy of the low zoom levels. Labelled with its true resolution in the UI.'),
  }),
  z.object({
    protocol: z.literal('raster_grid'),
    url: z.string().describe('Binary grid file'),
    encoding: z.enum(['int16le', 'float32le']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    gridExtent: z
      .object({ west: z.number().min(-180).max(360), south: z.number().min(-90).max(90), east: z.number().min(-180).max(360), north: z.number().min(-90).max(90) })
      .describe('Outer edges of the grid (pixel-is-area), longitudes expressed in lonConvention'),
    lonConvention: z.enum(['-180-180', '0-360E']),
    noData: z.number().nullable(),
  }),
  z.object({
    protocol: z.literal('geojson'),
    url: z.string(),
  }),
  z.object({
    protocol: z.literal('json_api'),
    url: z.string().describe('Endpoint with optional {placeholders}'),
  }),
]);

/**
 * How pixel values relate to physical quantities.
 *  visual  = rendered/stretched picture for display only (NOT quantitative)
 *  physical= numeric values in `unit` (value = raw * scale + offset)
 *  categorical = class codes / colors mapped to a legend (e.g. geologic units)
 */
export const ValueEncoding = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visual'), description: z.string().nullable() }),
  z.object({ type: z.literal('physical'), unit: z.string(), scale: z.number(), offset: z.number() }),
  z.object({ type: z.literal('categorical'), legendUrl: z.string().nullable() }),
]);

export const LayerKind = z.enum([
  'imagery',
  'elevation',
  'shaded_relief',
  'thermal',
  'geology',
  'mineralogy',
  'atmosphere',
  'radiation',
  'traverse',
  'waypoints',
  'rover_images',
]);

export const Layer = z
  .object({
    id: Id,
    name: z.string().describe('Official product name. Never translated.'),
    label: LocalizedText.describe('Short UI label, translatable'),
    kind: LayerKind,
    sourceIds: z.array(Id).min(1),
    access: LayerAccess,
    valueEncoding: ValueEncoding,
    resolution: Resolution,
    coverage: z.object({ global: z.boolean(), bbox: BBox }),
    temporal: TimeRange.nullable(),
    uncertainty: Uncertainty.nullable(),
    attribution: z.string().describe('Text that must be shown when the layer is visible'),
    provenance: Provenance.exclude(['ai_proposed', 'human_edit']),
    synthetic: z.boolean().default(false),
    defaultOpacity: z.number().min(0).max(1).default(1),
    notes: z.string().nullable().optional(),
  })
  .describe('A displayable/queryable data product');

export const RegionType = z.enum(['landing_site', 'crater', 'study_area', 'coverage', 'traverse_area', 'hazard_zone']);

export const Region = z
  .object({
    id: Id,
    name: z.string().describe('Official IAU / mission name when one exists (not translated)'),
    label: LocalizedText,
    type: RegionType,
    crs: Crs,
    center: LatLon,
    bbox: BBox,
    polygon: z
      .array(z.tuple([z.number(), z.number()]))
      .min(4)
      .nullable()
      .describe('Closed ring of [lon, lat] pairs; null when only a bbox is known'),
    lod: z.object({
      minZoom: z.number().int().min(0),
      maxZoom: z.number().int().min(0).describe('Deepest quadtree level justified by the best data here'),
      recommendedZoom: z.number().int().min(0),
    }),
    layerIds: z.array(Id),
    sourceIds: z.array(Id).min(1),
    parentId: Id.nullable(),
    description: LocalizedText.nullable(),
    provenance: Provenance.exclude(['ai_proposed', 'human_edit']),
    synthetic: z.boolean().default(false),
  })
  .describe('Named, georeferenced area of interest with stable id');

export const Feature = z
  .object({
    id: Id,
    regionId: Id,
    name: z.string().nullable(),
    label: LocalizedText.nullable(),
    kind: z.enum(['waypoint', 'landing_point', 'sample_site', 'science_target', 'landmark', 'hazard']),
    position: LatLon,
    observedAt: IsoDate.nullable(),
    sol: z.number().int().nullable().describe('Mission sol when the feature was observed/visited'),
    properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    sourceIds: z.array(Id).min(1),
    uncertainty: Uncertainty.nullable(),
    provenance: Provenance.exclude(['ai_proposed', 'human_edit']),
    synthetic: z.boolean().default(false),
  })
  .describe('Point feature (waypoint, sample, landmark...)');

/** Fixed reference values with citation (e.g. dose rate). Never presented as live data. */
export const ReferenceValue = z.object({
  id: Id,
  label: LocalizedText,
  quantity: z.string().describe('e.g. "absorbed_dose_rate"'),
  value: z.number(),
  uncertainty: z.number().nullable(),
  unit: z.string(),
  location: LatLon.nullable(),
  period: TimeRange.nullable(),
  sourceIds: z.array(Id).min(1),
  provenance: Provenance.exclude(['ai_proposed', 'human_edit', 'generated']),
  notes: LocalizedText.nullable(),
});

export const MarsCatalog = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: Id,
    title: z.string(),
    generatedAt: IsoDate,
    generator: z.string().describe('Who/what produced this file (team member, script, model)'),
    referenceSystem: z.object({
      body: z.literal('Mars'),
      crs: Crs,
      radius_m: z.number().positive().describe('Sphere radius used for rendering'),
      latitudeType: z.literal('planetocentric'),
      longitudeDirection: z.literal('east'),
      longitudeDomain: z.literal('-180..180'),
      verticalDatum: z.string(),
    }),
    sources: z.array(Source),
    layers: z.array(Layer),
    regions: z.array(Region),
    features: z.array(Feature),
    referenceValues: z.array(ReferenceValue),
  })
  .superRefine((cat, ctx) => {
    const sourceIds = new Set(cat.sources.map((s) => s.id));
    const layerIds = new Set(cat.layers.map((l) => l.id));
    const regionIds = new Set(cat.regions.map((r) => r.id));
    const all = [...cat.sources, ...cat.layers, ...cat.regions, ...cat.features, ...cat.referenceValues].map((x) => x.id);
    const dup = all.filter((id, i) => all.indexOf(id) !== i);
    if (dup.length) ctx.addIssue({ code: 'custom', message: `Duplicate ids: ${[...new Set(dup)].join(', ')}` });
    const checkRefs = (ids: string[], known: Set<string>, where: string) => {
      for (const id of ids) if (!known.has(id)) ctx.addIssue({ code: 'custom', message: `${where} references unknown id "${id}"` });
    };
    cat.layers.forEach((l) => checkRefs(l.sourceIds, sourceIds, `layer ${l.id}`));
    cat.regions.forEach((r) => {
      checkRefs(r.sourceIds, sourceIds, `region ${r.id}`);
      checkRefs(r.layerIds, layerIds, `region ${r.id}`);
      if (r.parentId) checkRefs([r.parentId], regionIds, `region ${r.id}`);
    });
    cat.features.forEach((f) => {
      checkRefs(f.sourceIds, sourceIds, `feature ${f.id}`);
      checkRefs([f.regionId], regionIds, `feature ${f.id}`);
    });
    cat.referenceValues.forEach((v) => checkRefs(v.sourceIds, sourceIds, `referenceValue ${v.id}`));
    // honesty rule: synthetic content must be declared as such
    [...cat.sources, ...cat.layers, ...cat.regions, ...cat.features].forEach((x) => {
      if (x.provenance === 'synthetic' && !x.synthetic)
        ctx.addIssue({ code: 'custom', message: `${x.id}: provenance "synthetic" requires synthetic: true` });
    });
  })
  .describe('MARS OS scientific catalog: original data only (no AI proposals, no edits)');

export type SourceT = z.infer<typeof Source>;
export type LayerT = z.infer<typeof Layer>;
export type LayerAccessT = z.infer<typeof LayerAccess>;
export type LayerKindT = z.infer<typeof LayerKind>;
export type RegionT = z.infer<typeof Region>;
export type FeatureT = z.infer<typeof Feature>;
export type ReferenceValueT = z.infer<typeof ReferenceValue>;
export type MarsCatalogT = z.infer<typeof MarsCatalog>;
