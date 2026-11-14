/**
 * Where the MARS OS backend lives. Empty = same origin (local dev via Vite proxy, or the backend
 * serving the app). On GitHub Pages it is set at build time to the hosted backend (e.g. Render).
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const api = (path: string) => `${API_BASE}${path}`;
