const CACHE='hybrid-athlete-v10';
const ASSETS=['./','./index.html','./manifest.json','./icon.svg','./cloud.js','./cloud.css','./program-patch.js','./running.js','./running.css','./running-cloud.js'];
const INJECT='<link rel="stylesheet" href="./cloud.css?v=10"><link rel="stylesheet" href="./running.css?v=10"><script src="./program-patch.js?v=10"><\/script><script src="./running.js?v=10"><\/script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0"><\/script><script src="./cloud.js?v=10"><\/script><script src="./running-cloud.js?v=10"><\/script>';

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

async function injectCloud(response){
  if(!response)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const text=await response.text();
  if(text.includes('./cloud.js'))return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers});
  const headers=new Headers(response.headers);headers.delete('content-length');
  return new Response(text.replace('</body>',INJECT+'</body>'),{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  const isAppHtml=e.request.mode==='navigate'||(url.origin===self.location.origin&&(url.pathname.endsWith('/index.html')||url.pathname.endsWith('/hybrid-athlete-app/')));
  if(isAppHtml){
    e.respondWith(
      fetch(e.request).then(resp=>{
        const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
        return injectCloud(resp);
      }).catch(async()=>injectCloud((await caches.match(e.request))||(await caches.match('./index.html'))))
    );
    return;
  }
  e.respondWith(
    fetch(e.request).then(resp=>{
      const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
