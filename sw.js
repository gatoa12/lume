/* LUMEN · Service Worker v1
   - Abre o app offline (cache) sem nunca prender a tela: a rede tem prioridade e, se demorar mais de 4 s, usa o cache.
   - Só guarda arquivos do próprio site. Não mexe em vídeos (Range), POST nem em outros domínios.
   - Para forçar atualização no futuro, mude o número em CACHE. */
const CACHE = 'lumen-v1';
const BASICO = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];
const ESPERA_REDE = 4000;

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* um arquivo que faltar (ex.: ícone) não pode derrubar a instalação */
    await Promise.all(BASICO.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('lumen-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function comLimite(promessa, ms) {
  return new Promise((ok, erro) => {
    const t = setTimeout(() => erro(new Error('rede lenta')), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); erro(e); });
  });
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const ehPagina = req.mode === 'navigate';
    try {
      const rede = fetch(req);
      const resp = ehPagina ? await comLimite(rede, ESPERA_REDE) : await rede;
      if (resp && resp.ok && resp.type === 'basic') cache.put(ehPagina ? 'index.html' : req, resp.clone()).catch(() => {});
      return resp;
    } catch (e) {
      const guardado = (await cache.match(req, { ignoreSearch: true })) || (ehPagina && (await cache.match('index.html') || await cache.match('./')));
      if (guardado) return guardado;
      return new Response('Sem conexão e sem cópia guardada. Abra o app uma vez com internet.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
