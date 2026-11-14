#!/usr/bin/env node
/**
 * Starts the MARS OS backend (child process, port MARS_OS_API_PORT or 8787) and the Vite dev
 * server (in-process, via Vite's JS API). Supported args: --port <n> --strictPort --host
 */
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 5173;

const backend = spawn('npx tsx watch --clear-screen=false server/index.ts', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, MARS_OS_API_PORT: process.env.MARS_OS_API_PORT ?? '8787' },
});
backend.on('exit', (code) => {
  if (code) console.error(`[mars-os] backend exited with code ${code}`);
});

const vite = await createServer({ server: { port, strictPort: args.includes('--strictPort'), host: args.includes('--host') || undefined } });
await vite.listen();
vite.printUrls();

const stop = async () => {
  backend.kill();
  await vite.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
