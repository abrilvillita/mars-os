/**
 * Builds the EVIDENCE PACK for one editable cell from catalogued products only, and re-checks
 * AI drafts against it. The AI never supplies sources, measurements, coordinates checks or
 * confidence: all of those are computed here.
 */
import type { AIAnalysisT, AIProposalDraftT, ChangeProposalT, EvidenceT, MarsCatalogT } from '../src/contract';
import { ChangeProposal } from '../src/contract';
import type { ElevationService } from '../src/core/elevation/ElevationService';
import { distanceM } from '../src/core/geo/mars';
import { nodeLatLon, parseCellId, tileBBox, tileWidthM } from '../src/core/geo/tiling';
import type { Waypoint } from '../src/core/live/m20';

export interface EvidencePack {
  task: string;
  cell: { id: string; bbox: { west: number; south: number; east: number; north: number }; widthM: number };
  regions: { id: string; name: string }[];
  products: { ref: string; layerId: string; name: string; metersPerPixel: number; sourceId: string; provenance: string }[];
  nodes: { ref: string; lat: number; lon: number; values: Record<string, number> }[];
  discrepancies: { pair: string; count: number; meanDiff_m: number; rms_m: number; maxAbs_m: number; largest: { ref: string; diff_m: number }[] }[];
  roverWaypoints: { ref: string; rmc: string; sol: number; lat: number; lon: number; roverElevGeoid_m: number; values: Record<string, number> }[];
  clientReportedEdits: { patchId: string; note: string }[];
  rules: string[];
}

const GRID = 9;

export async function buildEvidencePack(
  cellId: string,
  catalog: MarsCatalogT,
  elevation: ElevationService,
  waypoints: Waypoint[],
  clientEdits: string[],
): Promise<EvidencePack> {
  const t = parseCellId(cellId);
  if (!t) throw new Error('Invalid cell id');
  if (t.z < 6) throw new Error('Cell too large for analysis: choose cell level ≥ 6');
  const b = tileBBox(t);
  const widthM = tileWidthM(t);
  const wantMpp = widthM / (GRID - 1) / 2;

  // trigger on-demand loads, then wait for them
  const c = nodeLatLon(t, GRID, (GRID - 1) / 2, (GRID - 1) / 2);
  elevation.ensureDetail(c.lat, c.lon, 1);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const p = nodeLatLon(t, GRID, i, j);
    elevation.sampleEach(p.lat, p.lon, wantMpp);
  }
  await elevation.whenIdle(20000);

  const layerById = new Map(catalog.layers.map((l) => [l.id, l]));
  const products = new Map<string, EvidencePack['products'][number]>();
  const refFor = (layerId: string, mpp: number) => {
    let p = products.get(layerId);
    if (!p) {
      const l = layerById.get(layerId);
      p = { ref: `P${products.size + 1}`, layerId, name: l?.name ?? layerId, metersPerPixel: mpp, sourceId: l?.sourceIds[0] ?? 'unknown', provenance: l?.provenance ?? 'derived' };
      products.set(layerId, p);
    }
    p.metersPerPixel = Math.min(p.metersPerPixel, mpp);
    return p.ref;
  };

  const nodes: EvidencePack['nodes'] = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const p = nodeLatLon(t, GRID, i, j);
    const values: Record<string, number> = {};
    for (const s of elevation.sampleEach(p.lat, p.lon, wantMpp)) values[refFor(s.layerId, s.metersPerPixel)] = Math.round(s.elevation_m * 10) / 10;
    nodes.push({ ref: `N${i}_${j}`, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), values });
  }

  // pairwise disagreement between independent products (finest vs each coarser one)
  const refs = [...products.values()].sort((a, b) => a.metersPerPixel - b.metersPerPixel).map((p) => p.ref);
  const discrepancies: EvidencePack['discrepancies'] = [];
  for (let k = 1; k < refs.length; k++) {
    const a = refs[0], bRef = refs[k];
    const diffs = nodes.filter((n) => n.values[a] !== undefined && n.values[bRef] !== undefined).map((n) => ({ ref: n.ref, diff_m: +(n.values[a] - n.values[bRef]).toFixed(1) }));
    if (!diffs.length) continue;
    const mean = diffs.reduce((s, d) => s + d.diff_m, 0) / diffs.length;
    const rms = Math.sqrt(diffs.reduce((s, d) => s + d.diff_m ** 2, 0) / diffs.length);
    discrepancies.push({
      pair: `${a}-${bRef}`, count: diffs.length, meanDiff_m: +mean.toFixed(1), rms_m: +rms.toFixed(1),
      maxAbs_m: +Math.max(...diffs.map((d) => Math.abs(d.diff_m))).toFixed(1),
      largest: diffs.sort((x, y) => Math.abs(y.diff_m) - Math.abs(x.diff_m)).slice(0, 8),
    });
  }

  const roverWaypoints: EvidencePack['roverWaypoints'] = waypoints
    .filter((w) => w.elevGeoid_m !== null && w.lat >= b.south && w.lat <= b.north && w.lon >= b.west && w.lon <= b.east)
    .slice(0, 20)
    .map((w) => {
      const values: Record<string, number> = {};
      for (const s of elevation.sampleEach(w.lat, w.lon, 0)) values[refFor(s.layerId, s.metersPerPixel)] = Math.round(s.elevation_m * 10) / 10;
      return { ref: `W${w.rmc}`, rmc: w.rmc, sol: w.sol, lat: w.lat, lon: w.lon, roverElevGeoid_m: w.elevGeoid_m!, values };
    });

  const regions = catalog.regions
    .filter((r) => r.bbox.west <= b.east && r.bbox.east >= b.west && r.bbox.south <= b.north && r.bbox.north >= b.south)
    .map((r) => ({ id: r.id, name: r.name }));

  return {
    task: 'Review terrain consistency of one Mars cell using ONLY the data below.',
    cell: { id: cellId, bbox: b, widthM: Math.round(widthM) },
    regions,
    products: [...products.values()],
    nodes,
    discrepancies,
    roverWaypoints,
    clientReportedEdits: clientEdits.slice(0, 20).map((id) => ({ patchId: id, note: 'client-reported applied edit (not verified data)' })),
    rules: [
      'Use only refs present in this pack (P*, N*, W*). Never invent sources, coordinates or measurements.',
      'Elevations are meters relative to the MOLA areoid. Product resolution limits what can be resolved.',
      'A difference smaller than about the coarser product resolution-related noise is not evidence of change.',
      'Rover waypoint elevations (W*) are rover-reported and independent from orbital products.',
      'Only propose a geometry change when the data shows a localized, consistent disagreement; otherwise return no proposals.',
      'delta_m must not exceed the magnitude of the referenced discrepancies. radius_m must be at least twice the finest referenced product resolution.',
      'Do not give confidence values. Write every text in English (en) and Spanish (es).',
    ],
  };
}

/** Re-check each AI draft against the pack; build ChangeProposals for the ones that pass. */
export function draftsToProposals(pack: EvidencePack, analysis: AIAnalysisT, model: string, catalog: MarsCatalogT) {
  const nodeByRef = new Map(pack.nodes.map((n) => [n.ref, n]));
  const wpByRef = new Map(pack.roverWaypoints.map((w) => [w.ref, w]));
  const prodByRef = new Map(pack.products.map((p) => [p.ref, p]));
  const sourceUrl = (id: string) => catalog.sources.find((s) => s.id === id)?.url ?? null;
  const finest = [...pack.products].sort((a, b) => a.metersPerPixel - b.metersPerPixel)[0];
  const coarsest = [...pack.products].sort((a, b) => b.metersPerPixel - a.metersPerPixel)[0];
  const proposals: ChangeProposalT[] = [];
  const rejected: { index: number; reasons: string[] }[] = [];
  const now = new Date().toISOString();

  analysis.proposals.forEach((d: AIProposalDraftT, index) => {
    const reasons: string[] = [];
    const unknown = d.evidenceRefs.filter((r) => !nodeByRef.has(r) && !wpByRef.has(r) && !prodByRef.has(r));
    if (unknown.length) reasons.push(`unknown evidence refs: ${unknown.join(', ')}`);
    const b = pack.cell.bbox;
    if (d.center.lat < b.south || d.center.lat > b.north || d.center.lon < b.west || d.center.lon > b.east) reasons.push('center outside the analysed cell');
    // magnitude supported by referenced data
    let supported = 0;
    for (const r of d.evidenceRefs) {
      const n = nodeByRef.get(r);
      if (n && finest && coarsest && finest !== coarsest) {
        const a = n.values[finest.ref], c = n.values[coarsest.ref];
        if (a !== undefined && c !== undefined) supported = Math.max(supported, Math.abs(a - c));
      }
      const w = wpByRef.get(r);
      if (w && finest && w.values[finest.ref] !== undefined) supported = Math.max(supported, Math.abs(w.roverElevGeoid_m - w.values[finest.ref]));
    }
    if (supported === 0) reasons.push('no referenced measurement shows a discrepancy');
    else if (Math.abs(d.delta_m) > supported * 1.2) reasons.push(`|delta| ${Math.abs(d.delta_m)} m exceeds the referenced discrepancy (${supported.toFixed(1)} m)`);
    if (finest && d.radius_m < 2 * finest.metersPerPixel) reasons.push(`radius ${d.radius_m} m is finer than the data supports (min ${2 * finest.metersPerPixel} m)`);
    if (d.radius_m > pack.cell.widthM) reasons.push('radius larger than the analysed cell');
    if (reasons.length) {
      rejected.push({ index, reasons });
      return;
    }

    // evidence records are built from the pack, not from the model
    const usedProducts = new Set<string>();
    for (const r of d.evidenceRefs) {
      const n = nodeByRef.get(r) ?? wpByRef.get(r);
      if (n) Object.keys(n.values).forEach((k) => usedProducts.add(k));
      if (prodByRef.has(r)) usedProducts.add(r);
    }
    const evidence: EvidenceT[] = [...usedProducts].map((ref) => {
      const p = prodByRef.get(ref)!;
      const pts = d.evidenceRefs.filter((r) => nodeByRef.get(r)?.values[ref] !== undefined).map((r) => `${r}=${nodeByRef.get(r)!.values[ref]} m`);
      return {
        kind: 'dataset', sourceId: p.sourceId, url: sourceUrl(p.sourceId), retrievedAt: now, verified: true, synthetic: false,
        description: {
          en: `${p.name} (${p.metersPerPixel} m/px) sampled by MARS OS: ${pts.join(', ') || 'product in pack'}`,
          es: `${p.name} (${p.metersPerPixel} m/px) muestreado por MARS OS: ${pts.join(', ') || 'producto del paquete'}`,
        },
      };
    });
    const wps = d.evidenceRefs.map((r) => wpByRef.get(r)).filter(Boolean);
    for (const w of wps) {
      evidence.push({
        kind: 'rover_observation', sourceId: 'src.m20.mmgis.waypoints', url: sourceUrl('src.m20.mmgis.waypoints'), retrievedAt: now, verified: true, synthetic: false,
        description: { en: `Perseverance waypoint ${w!.rmc} (sol ${w!.sol}) reported ${w!.roverElevGeoid_m} m`, es: `Waypoint ${w!.rmc} de Perseverance (sol ${w!.sol}) reportó ${w!.roverElevGeoid_m} m` },
      });
    }
    evidence.push({
      kind: 'report', sourceId: null, url: null, retrievedAt: now, verified: false, synthetic: false,
      description: { en: `AI interpretation (${model}): ${d.rationale.en}`, es: `Interpretación de IA (${model}): ${d.rationale.es}` },
    });

    // rule-based confidence from data agreement (never self-reported by the AI)
    const nodeRefs = d.evidenceRefs.filter((r) => nodeByRef.has(r)).length;
    let confidence = 0.3 + Math.min(0.2, nodeRefs * 0.04) + (usedProducts.size >= 2 ? 0.15 : 0) + (wps.length ? 0.2 : 0);
    confidence = Math.min(0.85, +confidence.toFixed(2));
    const distKm = (distanceM(d.center.lat, d.center.lon, (b.north + b.south) / 2, (b.east + b.west) / 2) / 1000).toFixed(2);
    const id = `${Date.now().toString(36)}${index}`;
    const proposal = ChangeProposal.parse({
      id: `prop.gemini.${id}`,
      createdAt: now,
      origin: { kind: 'ai', id: 'gemini', model, version: 'generateContent v1beta' },
      regionIds: [pack.cell.id, ...pack.regions.map((r) => r.id)].slice(0, 6),
      patches: [{ type: 'radial', id: `patch.gemini.${id}`, center: { lat: d.center.lat, lon: d.center.lon, elevation_m: null }, radius_m: d.radius_m, delta_m: d.delta_m, falloff: d.falloff }],
      evidence,
      confidence,
      confidenceBasis: {
        en: `Rule-based by MARS OS: ${nodeRefs} grid nodes, ${usedProducts.size} independent elevation product(s)${wps.length ? `, ${wps.length} rover waypoint(s)` : ''}. Not reported by the AI. Center ${distKm} km from cell center.`,
        es: `Calculada por reglas de MARS OS: ${nodeRefs} nodos, ${usedProducts.size} producto(s) de elevación independientes${wps.length ? `, ${wps.length} waypoint(s) del rover` : ''}. No la reporta la IA. Centro a ${distKm} km del centro de la celda.`,
      },
      risk: d.risk,
      rationale: d.rationale,
      status: 'pending',
      review: null,
      appliedVersionId: null,
      synthetic: false,
    });
    proposals.push(proposal);
  });
  return { proposals, rejected };
}
