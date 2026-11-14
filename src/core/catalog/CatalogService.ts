/** Loads and validates scientific catalogs (contract: MarsCatalog). Multiple catalogs merge by id. */
import { MarsCatalog, type LayerT, type MarsCatalogT, type RegionT, type SourceT } from '../../contract';

export class CatalogService {
  private catalogs: MarsCatalogT[] = [];
  sources = new Map<string, SourceT>();
  layers = new Map<string, LayerT>();
  regions = new Map<string, RegionT>();

  async load(url: string): Promise<MarsCatalogT> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Catalog ${url}: HTTP ${res.status}`);
    const parsed = MarsCatalog.safeParse(await res.json());
    if (!parsed.success) {
      const msg = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Catalog ${url} failed validation:\n${msg}`);
    }
    this.add(parsed.data);
    return parsed.data;
  }

  add(c: MarsCatalogT) {
    this.catalogs.push(c);
    c.sources.forEach((s) => this.sources.set(s.id, s));
    c.layers.forEach((l) => this.layers.set(l.id, l));
    c.regions.forEach((r) => this.regions.set(r.id, r));
  }

  get all() {
    return this.catalogs;
  }
  get primary() {
    return this.catalogs[0] ?? null;
  }
  features() {
    return this.catalogs.flatMap((c) => c.features);
  }
  referenceValues() {
    return this.catalogs.flatMap((c) => c.referenceValues);
  }
}
