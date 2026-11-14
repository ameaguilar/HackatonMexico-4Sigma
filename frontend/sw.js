/* CobraVoz demo PWA: solo archivos estáticos, nunca cachear pagos reales ni respuestas de autenticación. */
const CACHE="cobravoz-preview-unificado-v18-20261114";
const ASSETS=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/cobravoz.svg",
  "./css/bootstrap.min.css",
  "./css/styles.css?v=merged-1",
  "./js/app.js?v=merged-1",
  "./js/voice.js?v=voice-1",
  "./js/payments.js",
  "./js/voice-commands.js",
  "./js/demo-qr.js",
  "./js/movements.js",
  "./js/supabase-auth.js",
  "./pages/access.html",
  "./pages/registration.html",
  "./pages/home.html",
  "./pages/charge.html",
  "./pages/payment.html",
  "./pages/history.html"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener("fetch",event=>{const req=event.request;const u=new URL(req.url);if(req.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/")||u.pathname.startsWith("/auth/v1/")||u.pathname.startsWith("/rest/v1/"))return;if(req.mode==="navigate"){event.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return resp;}).catch(()=>caches.match(req).then(x=>x||caches.match("./index.html"))));return;}event.respondWith(caches.match(req).then(x=>x||fetch(req)));});
