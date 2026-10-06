/* LUMEN · Service Worker
   v4: ao subir a versão, TROQUE só o número em CACHE (lumen-v5, v6…). Isso invalida o cache antigo. */
const CACHE = 'lumen-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];

/* install: pré-carrega o shell (um a um: se um ícone faltar, o resto não falha) e já assume (skipWaiting) */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (u) => {
      try { await cache.add(new Request(u, { cache: 'reload' })); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

/* activate: apaga TODOS os caches antigos (lumen-v1…v3) e toma o controle das abas abertas (clients.claim) */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    try { if (self.registration.navigationPreload) await self.registration.navigationPreload.disable(); } catch (_) {}
    await self.clients.claim();
  })());
});

/* permite à página pedir a troca imediata: navigator.serviceWorker.controller.postMessage('SKIP_WAITING') */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            /* câmera Wi-Fi (CCAPI), upload e CDNs: nunca interceptar */
  if (url.pathname.endsWith('/sw.js')) return;                /* o próprio sw.js sempre vem da rede */

  /* páginas (index.html): REDE PRIMEIRO, ignorando o cache HTTP → o novo index.html chega no próximo reload.
     Sem rede (campo, sem sinal): usa a cópia guardada, então o app continua abrindo offline. */
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          const c = await caches.open(CACHE);
          c.put('index.html', fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true })) || (await c.match('index.html')) || (await c.match('./')) ||
               new Response('Sem conexão e sem cópia local.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  /* demais arquivos do mesmo site (ícones, manifest): usa o guardado e atualiza em segundo plano */
  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
