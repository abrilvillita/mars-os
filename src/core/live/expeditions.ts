/**
 * Expedition stops of every NASA surface mission, human Exploration Zones and landing ellipses
 * (copied from NASA Mars Trek by scripts/build-expeditions.mjs). Pure data access.
 */
export interface ExpeditionStop {
  mission: string;
  name: string;
  lat: number;
  lon: number;
  hardware: boolean;
  text: string | null;
  image: string | null;
  page: string | null;
  source: string;
}

export interface ExplorationZone {
  name: string;
  lat: number;
  lon: number;
  elevKm: number | null;
  presentation: string | null;
}

export interface LandingEllipse {
  mission: string;
  name: string;
  date: string | null;
  size: string | null;
  areaKm2: number | null;
  ring: [number, number][];
  source: string;
}

export interface ExpeditionsDoc {
  retrieved: string;
  sources: { stops: string; zones: string; ellipses: string };
  stops: ExpeditionStop[];
  zones: ExplorationZone[];
  landingZones: { name: string; lat: number; lon: number }[];
  ellipses: LandingEllipse[];
}

export const expeditions: { doc: ExpeditionsDoc | null; loading: Promise<ExpeditionsDoc | null> | null } = { doc: null, loading: null };

export function loadExpeditions(baseUrl: string) {
  if (!expeditions.loading) {
    expeditions.loading = fetch(baseUrl + 'data/expeditions.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ExpeditionsDoc | null) => {
        if (d) {
          // the InSight service repeats one ellipse: keep one per mission + size
          const seen = new Set<string>();
          d.ellipses = d.ellipses.filter((e) => (seen.has(e.mission + e.size) ? false : (seen.add(e.mission + e.size), true)));
        }
        return (expeditions.doc = d);
      })
      .catch(() => null);
  }
  return expeditions.loading;
}
