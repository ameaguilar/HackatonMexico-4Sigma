/* CobraVoz V3 demo PWA: solo archivos estáticos, nunca cachear pagos. */
const CACHE="cobravoz-preview-movimientos-v5-20261114";
const ASSETS=["./","./index.html","./cobros-v1.html","./manifest.webmanifest","./icons/cobravoz.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener("fetch",event=>{const req=event.request;const u=new URL(req.url);if(req.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/"))return;if(req.mode==="navigate"){event.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return resp;}).catch(()=>caches.match(req).then(x=>x||caches.match("./index.html"))));return;}event.respondWith(caches.match(req).then(x=>x||fetch(req)));});
