/** Demo sandbox (simulated engines, separate history) only when explicitly requested with ?demo. */
export const DEMO_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
