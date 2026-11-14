/** Minimal typed event bus shared by core services, the API facade, the renderer and the UI. */
import type { BBoxT } from '../contract';

export interface MarsEvents {
  /** Terrain heights changed inside bbox (null = everywhere, e.g. exaggeration change). */
  'terrain:changed': { bbox: BBoxT | null; reason: string };
  'proposals:changed': { proposalId: string | null };
  'history:changed': { headVersionId: string | null; viewingVersionId: string | null };
  'catalog:loaded': { catalogId: string };
  'tiles:status': { offline: boolean; failures: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = MarsEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]) {
    this.handlers.get(type)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
  }
}
