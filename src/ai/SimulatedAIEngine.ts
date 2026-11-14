/**
 * SIMULATED AI engine — a stand-in that exercises the proposal pipeline for demos and tests.
 * Everything it produces is marked `synthetic: true` and labelled in every language.
 * A real engine must call `marsOS.proposals.submit()` with the same contract (see docs/API.md).
 */
import type { ChangeProposalT } from '../contract';

export type SimScenario = 'obstacle' | 'news' | 'rover';

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const jitter = (v: number, d: number) => v + (Math.random() - 0.5) * d;

export function simulateProposal(scenario: SimScenario, lat: number, lon: number, cell: string): ChangeProposalT {
  const id = uid();
  const base = {
    id: `prop.sim.${id}`,
    createdAt: new Date().toISOString(),
    origin: { kind: 'ai' as const, id: 'simulated-engine', model: null, version: '0.1-demo' },
    regionIds: [cell],
    status: 'pending' as const,
    review: null,
    appliedVersionId: null,
    synthetic: true,
  };
  if (scenario === 'obstacle') {
    return {
      ...base,
      patches: [{ type: 'radial', id: `patch.sim.${id}`, center: { lat: jitter(lat, 0.002), lon: jitter(lon, 0.002) }, radius_m: 250, delta_m: 18, falloff: 'gaussian' }],
      evidence: [{
        kind: 'image', sourceId: 'src.trek.jezero.hirise', url: null, retrievedAt: new Date().toISOString(), verified: false, synthetic: true,
        description: { en: 'SIMULATED: shadow pattern in orbital image interpreted as a ~18 m rise (demo, not a real detection).', es: 'SIMULADO: patrón de sombras en imagen orbital interpretado como una elevación de ~18 m (demo, no es una detección real).' },
      }],
      confidence: 0.71,
      risk: 'medium',
      rationale: { en: 'SIMULATED: possible new obstacle on the route. Raising terrain locally so route planning avoids it.', es: 'SIMULADO: posible obstáculo nuevo en la ruta. Se eleva el terreno localmente para que la planificación de rutas lo evite.' },
    };
  }
  if (scenario === 'news') {
    return {
      ...base,
      patches: [{ type: 'radial', id: `patch.sim.${id}`, center: { lat: jitter(lat, 0.003), lon: jitter(lon, 0.003) }, radius_m: 600, delta_m: -35, falloff: 'cosine' }],
      evidence: [{
        kind: 'news', sourceId: null, url: null, retrievedAt: new Date().toISOString(), verified: false, synthetic: true,
        description: { en: 'SIMULATED: unverified news report claims "a collapsed area" here. No authoritative product confirms it.', es: 'SIMULADO: una noticia no verificada afirma que aquí hay "una zona hundida". Ningún producto oficial lo confirma.' },
      }],
      confidence: 0.22,
      risk: 'high',
      rationale: { en: 'SIMULATED: change suggested only by unverified news. Should be held for review and cross-checked with orbital data.', es: 'SIMULADO: cambio sugerido solo por una noticia no verificada. Debe quedar en revisión y contrastarse con datos orbitales.' },
    };
  }
  return {
    ...base,
    patches: [{ type: 'radial', id: `patch.sim.${id}`, center: { lat: jitter(lat, 0.001), lon: jitter(lon, 0.001) }, radius_m: 120, delta_m: -4, falloff: 'cosine' }],
    evidence: [{
      kind: 'rover_observation', sourceId: null, url: null, retrievedAt: new Date().toISOString(), verified: true, synthetic: true,
      description: { en: 'SIMULATED: rover stereo pair shows a 4 m deep hollow (demo of a high-confidence, verified observation).', es: 'SIMULADO: un par estéreo del rover muestra una hondonada de 4 m (demo de una observación verificada de alta confianza).' },
    }],
    confidence: 0.93,
    risk: 'low',
    rationale: { en: 'SIMULATED: ground-truth from a rover refines the coarse orbital elevation model here.', es: 'SIMULADO: datos de superficie de un rover refinan aquí el modelo de elevación orbital, que es de baja resolución.' },
  };
}
