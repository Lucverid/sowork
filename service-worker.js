// Build placeholders are replaced by scripts/vite-pwa.mjs.
const PRECACHE = ["./","./index.html","./manifest.json","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./icons/apple-touch-icon.png","./assets/index-inH1nf3c.js","./assets/index-BX8KPSVo.css"];
const RELEASE = "2.1.12-58f9defcf26b";
const SCOPE = new URL('./', self.location.href);
const CACHE_PREFIX = `sowork:${SCOPE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const STATIC_PATHS = new Set(PRECACHE.map(path=>new URL(path,SCOPE).pathname));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.map(path=>new Request(new URL(path,SCOPE),{cache:'reload'})));
    // Activate updates after open sessions close, preserving operational forms.
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX) && name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigation(request) {
  const cache=await caches.open(CACHE_NAME);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  try {
    const response=await fetch(request,{signal:controller.signal});
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      await cache.put(new URL('index.html',SCOPE).href,response.clone());
      return response;
    }
    return await cache.match(new URL('index.html',SCOPE).href) || response;
  } catch {
    return await cache.match(new URL('index.html',SCOPE).href) || Response.error();
  } finally { clearTimeout(timer); }
}

async function staticAsset(request) {
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);
  if(cached) return cached;
  const response=await fetch(request);
  if(response.ok) await cache.put(request,response.clone());
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  // Never intercept Firebase/Auth, operational APIs, other branches, or writes.
  if(request.method!=='GET' || url.origin!==SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if(request.mode==='navigate') {
    if(url.pathname===SCOPE.pathname || url.pathname===new URL('index.html',SCOPE).pathname) event.respondWith(navigation(request));
    return;
  }
  const isBuildAsset=url.pathname.startsWith(`${SCOPE.pathname}assets/`) && /\.(js|css|woff2?|png|svg|ico)$/.test(url.pathname);
  if(!STATIC_PATHS.has(url.pathname) && !isBuildAsset) return;
  if(url.pathname===SCOPE.pathname || url.pathname===new URL('index.html',SCOPE).pathname) return;
  event.respondWith(staticAsset(request));
});
