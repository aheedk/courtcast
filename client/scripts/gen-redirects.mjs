// Writes dist/_redirects after vite build. Reads BACKEND_URL from env
// (set in the Netlify dashboard) and emits an /api/* proxy to the
// Railway backend, plus the SPA fallback for client-side routing.
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');

const backend = process.env.BACKEND_URL ?? '';
const lines = [];

if (backend) {
  const trimmed = backend.replace(/\/$/, '');
  lines.push(`/api/*  ${trimmed}/api/:splat  200`);
} else {
  console.warn(
    '[gen-redirects] BACKEND_URL is not set — /api/* proxy will be skipped. ' +
    'Set BACKEND_URL in the Netlify dashboard before re-deploying.',
  );
}

// SPA fallback: every other path serves index.html.
lines.push('/*  /index.html  200');

const body = lines.join('\n') + '\n';
await writeFile(resolve(dist, '_redirects'), body);
console.log(`[gen-redirects] wrote ${dist}/_redirects:\n${body}`);
