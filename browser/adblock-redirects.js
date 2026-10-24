'use strict';
/* Redirect-resurser ("stubbar"): när ett filter säger $redirect=NAMN byter vi ut den blockerade
 * resursen mot en ofarlig variant i stället för att bara avbryta den — så sidor som VÄNTAR på
 * skriptet (t.ex. en videospelare eller en annonssnutt) inte hänger sig eller går sönder.
 *
 * Egna, minimala stubbar. Resurser vi inte har (komplexa SDK:er) → webbläsaren faller tillbaka på
 * ren blockering, vilket aldrig är sämre än förut. */

const GIF1x1 = { mime: 'image/gif', b64: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' };
const PNG1x1 = { mime: 'image/png', b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
const TOM_JS = { mime: 'application/javascript', body: '' };
const TOM_TEXT = { mime: 'text/plain', body: '' };
const TOM_HTML = { mime: 'text/html', body: '' };
const TOM_JSON = { mime: 'application/json', body: '{}' };
const TOM_MP3 = { mime: 'audio/mpeg', body: '' };
const TOM_MP4 = { mime: 'video/mp4', body: '' };

// Minimala API-stubbar så sidans annonskod inte kastar fel
const ADSBYGOOGLE = { mime: 'application/javascript', body:
  "(function(){'use strict';var w=window;w.adsbygoogle=w.adsbygoogle||[];" +
  "var push=function(){};if(w.adsbygoogle.loaded!==true){w.adsbygoogle.loaded=true;" +
  "try{var a=w.adsbygoogle;a.length=a.length||0;a.push=push;}catch(e){}}" +
  "w.adsbygoogle.push=push;})();" };

const GPT = { mime: 'application/javascript', body:
  "(function(){'use strict';var noop=function(){};" +
  "function Slot(){};var sp=Slot.prototype;" +
  "sp.addService=function(){return this};sp.setCollapseEmptyDiv=function(){return this};" +
  "sp.setTargeting=function(){return this};sp.updateTargetingFromMap=function(){return this};" +
  "sp.get=noop;sp.set=function(){return this};sp.getSlotElementId=function(){return ''};" +
  "sp.getAdUnitPath=function(){return ''};sp.defineSizeMapping=function(){return this};" +
  "var pubads={addEventListener:function(t,f){if(t==='slotRenderEnded'){} return pubads},removeEventListener:noop," +
  "enableSingleRequest:noop,disableInitialLoad:noop,refresh:noop,setTargeting:function(){return pubads}," +
  "clear:noop,collapseEmptyDivs:noop,getSlots:function(){return[]},setCentering:noop,set:function(){return pubads}," +
  "get:noop,display:noop,updateCorrelator:noop,setPublisherProvidedId:noop,setPrivacySettings:function(){return pubads}," +
  "setRequestNonPersonalizedAds:function(){return pubads},setSafeFrameConfig:function(){return pubads},isInitialLoadDisabled:function(){return true}};" +
  "var gt={cmd:[],apiReady:true,pubadsReady:true," +
  "defineSlot:function(){return new Slot()},defineOutOfPageSlot:function(){return new Slot()}," +
  "pubads:function(){return pubads},enableServices:noop,display:noop,destroySlots:function(){return true}," +
  "sizeMapping:function(){var b={addSize:function(){return b},build:function(){return[]}};return b}," +
  "companionAds:function(){return{addEventListener:noop,removeEventListener:noop,setRefreshUnfilledSlots:noop,enableSyncLoading:noop}}," +
  "content:function(){return{addEventListener:noop,removeEventListener:noop,setContent:noop}}," +
  "setAdIframeTitle:noop,getVersion:function(){return'0'}};" +
  "var push=function(){var a=arguments;for(var i=0;i<a.length;i++){try{if(typeof a[i]==='function')a[i]()}catch(e){}}return 1};" +
  "gt.cmd={push:push};" +
  // Ta ÖVER ett ev. befintligt googletag (sidan har ofta redan köat i cmd) och spela upp kön
  "var fore=window.googletag;window.googletag=gt;" +
  "if(fore&&fore.cmd&&typeof fore.cmd.length==='number'){for(var i=0;i<fore.cmd.length;i++){push(fore.cmd[i]);}}})();" };

const GTM = { mime: 'application/javascript', body:
  "(function(){'use strict';window.dataLayer=window.dataLayer||[];" +
  "if(typeof window.dataLayer.push!=='function')window.dataLayer.push=function(){};" +
  "window.google_tag_manager=window.google_tag_manager||{};})();" };

const ANALYTICS = { mime: 'application/javascript', body:
  "(function(){'use strict';var noop=function(){};" +
  "var ga=function(){var a=arguments;if(a.length&&typeof a[a.length-1]==='object'){" +
  "var o=a[a.length-1];if(typeof o.hitCallback==='function'){try{o.hitCallback()}catch(e){}}}};" +
  "ga.create=function(){return{get:noop,set:noop,send:noop}};ga.getByName=function(){return null};" +
  "ga.getAll=function(){return[]};ga.remove=noop;ga.loaded=true;ga.q=[];" +
  "var name=window.GoogleAnalyticsObject||'ga';var fore=window[name];window[name]=ga;" +
  // spela upp ev. köade ga(...)-anrop (de kan ha en hitCallback som sidan väntar på)
  "if(fore&&fore.q&&fore.q.length){for(var i=0;i<fore.q.length;i++){try{ga.apply(null,fore.q[i])}catch(e){}}}" +
  "window.gtag=window.gtag||function(){};window.dataLayer=window.dataLayer||[];})();" };

// Kanoniska resurser
const RES = {
  'noopjs': TOM_JS, 'noop.js': TOM_JS, 'noop.text.js': TOM_JS,
  'nooptext': TOM_TEXT, 'noop.txt': TOM_TEXT,
  'noopframe': TOM_HTML, 'noop.html': TOM_HTML,
  'noopjson': TOM_JSON, 'noop-vmap1.0.xml': { mime: 'text/xml', body: '<?xml version="1.0" encoding="UTF-8"?><vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"></vmap:VMAP>' },
  '1x1.gif': GIF1x1, '1x1-transparent.gif': GIF1x1,
  '2x2.png': PNG1x1, '2x2-transparent.png': PNG1x1, '3x2.png': PNG1x1, '3x2-transparent.png': PNG1x1, '32x32.png': PNG1x1, '32x32-transparent.png': PNG1x1,
  'noopmp3-0.1s': TOM_MP3, 'noop-0.1s.mp3': TOM_MP3, 'noopmp4-1s': TOM_MP4, 'noop-1s.mp4': TOM_MP4,
  'googlesyndication_adsbygoogle.js': ADSBYGOOGLE, 'googlesyndication-adsbygoogle.js': ADSBYGOOGLE,
  'googletagservices_gpt.js': GPT, 'googletagservices-gpt.js': GPT,
  'googletagmanager_gtm.js': GTM, 'googletagmanager-gtm.js': GTM, 'google-analytics_ga.js': ANALYTICS,
  'google-analytics_analytics.js': ANALYTICS, 'google-analytics.com/analytics.js': ANALYTICS, 'googletagmanager.com/gtm.js': GTM,
};

// Hämta en resurs för ett redirect-namn. Returnerar { mime, body:Buffer } eller null.
function hamta(namn) {
  if (!namn) return null;
  let r = RES[namn] || RES[namn.replace(/\.js$/, '')] || null;
  if (!r) return null;
  const body = r.b64 ? Buffer.from(r.b64, 'base64') : Buffer.from(r.body || '', 'utf8');
  return { mime: r.mime, body };
}

module.exports = { hamta };
