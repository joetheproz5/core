// Patches @omss/framework to support TMDB v4 read-access tokens (JWT) in addition to v3 keys.
// Upstream sends the key as ?api_key=..., which TMDB rejects for v4 JWTs.
// Runs automatically after `npm install` (see package.json postinstall). Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = "node_modules/@omss/framework/dist/services/tmdb.service.js";
const MARKER = "globalThis.__cineproTmdbV4Patched";

let source;
try {
  source = readFileSync(file, "utf8");
} catch {
  console.log("[patch-framework] @omss/framework not found - skipping.");
  process.exit(0);
}

if (source.includes(MARKER)) {
  console.log("[patch-framework] already patched - skipping.");
  process.exit(0);
}

const target = "this.apiKey = apiKey;";
if (!source.includes(target)) {
  console.error("[patch-framework] constructor marker not found - patch NOT applied. TMDB v4 tokens would fail at runtime.");
  process.exit(0);
}

const replacement = `this.apiKey = apiKey;
        // [patch-framework] Support TMDB v4 read-access JWTs: upstream sends ?api_key=<jwt>,
        // which TMDB rejects. Wrap fetch to strip the query key and send a Bearer header instead.
        if (apiKey && apiKey.startsWith('ey') && !globalThis.__cineproTmdbV4Patched) {
            globalThis.__cineproTmdbV4Patched = true;
            const tmdbOriginalFetch = globalThis.fetch;
            globalThis.fetch = (input, init = {}) => {
                try {
                    const url = typeof input === 'string' ? input : input?.url || '';
                    if (url.startsWith('https://api.themoviedb.org/3') && url.includes('api_key=')) {
                        const cleanUrl = url.replace(/([?&])api_key=[^&]*&?/, '$1').replace(/[?&]$/, '');
                        const headers = new Headers(init?.headers || (typeof input === 'object' ? input?.headers : undefined) || {});
                        headers.set('Authorization', \`Bearer \${apiKey}\`);
                        headers.set('accept', 'application/json');
                        return tmdbOriginalFetch(cleanUrl, { ...init, headers });
                    }
                } catch {}
                return tmdbOriginalFetch(input, init);
            };
        }`;

// Use a replacer function so `$` sequences in the patch text are never interpreted.
writeFileSync(file, source.replace(target, () => replacement));
console.log("[patch-framework] patched tmdb.service.js for TMDB v4 token support.");
