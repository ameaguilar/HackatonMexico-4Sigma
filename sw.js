/* Shell offline de demostración. Nunca almacenar pagos ni respuestas de API. */
const CACHE='cobravoz-demo-mexicovivo-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/cobravoz.svg'];
self.addEventListener('install', event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate', event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch', event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request).then(res=>res||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
