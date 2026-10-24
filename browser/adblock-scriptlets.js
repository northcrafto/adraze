'use strict';
/* Scriptlets: små JS-snuttar som listorna (##+js(...)) injicerar i sidan för att desarmera
 * anti-adblock, timers, overlays m.m. Vi bygger ihop de scriptlets som gäller en värd till EN
 * kodsträng som injiceras i sidans egen värld vid document_start.
 *
 * Egna, minimala implementationer av de vanligaste. Okänt scriptlet → hoppas över (ingen effekt). */

// Dela "namn, arg1, arg2" (respekterar \, som bokstavligt komma)
function dela(s) {
  const d = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === ',') { cur += ','; i++; }
    else if (c === ',') { d.push(cur); cur = ''; }
    else cur += c;
  }
  d.push(cur);
  return d.map((x) => x.trim());
}

const S = (x) => JSON.stringify(String(x == null ? '' : x));

// Tolka uBO-värden: 'true'/'false'/'null'/'undefined'/'noopFunc'/tal → riktigt JS-uttryck, annars sträng
function vardeUttryck(v) {
  switch (v) {
    case 'true': return 'true';
    case 'false': return 'false';
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case '': case 'emptyObj': return '{}';
    case 'emptyArr': return '[]';
    case 'noopFunc': return 'function(){}';
    case 'trueFunc': return 'function(){return true}';
    case 'falseFunc': return 'function(){return false}';
    case "''": return "''";
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  return S(v);
}

// Regex-arg från uBO: /re/ → riktig regex; annars delsträng (escapas)
function regexKod(a) {
  if (!a || a === '*' || a === '/^/') return '/.?/';
  if (a.length > 1 && a[0] === '/' && a.lastIndexOf('/') > 0) {
    const slut = a.lastIndexOf('/'); const kropp = a.slice(1, slut); const flagg = a.slice(slut + 1);
    try { new RegExp(kropp, flagg); return '/' + kropp + '/' + flagg; } catch { /* faller igenom */ }
  }
  return 'new RegExp(' + S(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + ')';
}

// ── Scriptlet-implementationer: (args) → JS-kod (IIFE) ──
const KIT = {
  // Sätt window.x.y = värde som konstant
  'set-constant': (a) => {
    const [kedja, varde] = a; if (!kedja) return '';
    return `(function(){var chain=${S(kedja)},v=${vardeUttryck(varde)};function set(o,c){var i=c.indexOf('.');if(i<0){try{Object.defineProperty(o,c,{get:function(){return v},set:function(){},configurable:false})}catch(e){try{o[c]=v}catch(e2){}}return;}var p=c.slice(0,i),rest=c.slice(i+1);var cur=o[p];if(cur&&(typeof cur==='object'||typeof cur==='function')){set(cur,rest);return;}try{Object.defineProperty(o,p,{get:function(){return cur},set:function(nv){cur=nv;if(nv&&(typeof nv==='object'||typeof nv==='function'))set(nv,rest)},configurable:true})}catch(e){}}set(window,chain);})();`;
  },
  // Kasta fel när window.x läses (desarmerar anti-adblock som läser en flagga)
  'abort-on-property-read': (a) => {
    const [kedja] = a; if (!kedja) return '';
    return `(function(){var chain=${S(kedja)};var m='Aborted';function abort(){throw new ReferenceError(m+Math.random().toString(36).slice(2))}function set(o,c){var i=c.indexOf('.');if(i<0){try{Object.defineProperty(o,c,{get:abort,set:function(){},configurable:false})}catch(e){}return;}var p=c.slice(0,i),rest=c.slice(i+1);var cur=o[p];if(cur&&typeof cur==='object'){set(cur,rest);return;}try{Object.defineProperty(o,p,{get:function(){return cur},set:function(nv){cur=nv;if(nv&&typeof nv==='object')set(nv,rest)},configurable:true})}catch(e){}}set(window,chain);})();`;
  },
  // Kasta fel när window.x skrivs
  'abort-on-property-write': (a) => {
    const [kedja] = a; if (!kedja) return '';
    return `(function(){var chain=${S(kedja)};function abort(){throw new ReferenceError('Aborted'+Math.random().toString(36).slice(2))}function set(o,c){var i=c.indexOf('.');if(i<0){try{Object.defineProperty(o,c,{set:abort,configurable:false})}catch(e){}return;}var p=c.slice(0,i),rest=c.slice(i+1);var cur=o[p];if(cur&&typeof cur==='object'){set(cur,rest);return;}try{Object.defineProperty(o,p,{get:function(){return cur},set:function(nv){cur=nv;if(nv&&typeof nv==='object')set(nv,rest)},configurable:true})}catch(e){}}set(window,chain);})();`;
  },
  // Stäng av addEventListener för matchande typ/handler
  'addEventListener-defuser': (a) => {
    const [typ, monster] = a;
    return `(function(){var rt=${typ?regexKod(typ):'/.?/'},rh=${monster?regexKod(monster):'/.?/'};var o=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(t,h){try{var hs=String(h);if(rt.test(String(t))&&rh.test(hs)){return;}}catch(e){}return o.apply(this,arguments);};})();`;
  },
  // Blockera setTimeout-callbacks vars kod matchar (ev. med fördröjning)
  'no-setTimeout-if': (a) => {
    const [monster, fordrojning] = a;
    const neg = monster && monster[0] === '!';
    const m = neg ? monster.slice(1) : monster;
    return `(function(){var re=${m?regexKod(m):'/.?/'},neg=${neg?'true':'false'},delay=${fordrojning&&/^\d+$/.test(fordrojning)?fordrojning:'-1'};var o=window.setTimeout;window.setTimeout=function(f,d){try{var s=(typeof f==='function'?Object.prototype.toString.call(f)==='[object Function]'?f.toString():String(f):String(f));var matchar=re.test(s);if(neg)matchar=!matchar;if(matchar&&(delay<0||+d===delay))return 0;}catch(e){}return o.apply(this,arguments);};})();`;
  },
  // Blockera setInterval-callbacks vars kod matchar
  'no-setInterval-if': (a) => {
    const [monster, fordrojning] = a;
    const neg = monster && monster[0] === '!';
    const m = neg ? monster.slice(1) : monster;
    return `(function(){var re=${m?regexKod(m):'/.?/'},neg=${neg?'true':'false'},delay=${fordrojning&&/^\d+$/.test(fordrojning)?fordrojning:'-1'};var o=window.setInterval;window.setInterval=function(f,d){try{var s=(typeof f==='function'?f.toString():String(f));var matchar=re.test(s);if(neg)matchar=!matchar;if(matchar&&(delay<0||+d===delay))return 0;}catch(e){}return o.apply(this,arguments);};})();`;
  },
  // Avbryt det körande skriptet om det läser window.x (anti-adblock-skript)
  'abort-current-script': (a) => {
    const [kedja, sok] = a; if (!kedja) return '';
    return `(function(){var chain=${S(kedja)},needle=${sok?regexKod(sok):'null'};function match(){if(!needle)return true;try{var s=document.currentScript;return s&&needle.test(s.textContent||'')}catch(e){return false}}function set(o,c){var i=c.indexOf('.');if(i<0){var val=o[c];try{Object.defineProperty(o,c,{get:function(){if(match())throw new ReferenceError('Aborted'+Math.random().toString(36).slice(2));return val},set:function(nv){val=nv},configurable:false})}catch(e){}return;}var p=c.slice(0,i),rest=c.slice(i+1);var cur=o[p];if(cur&&typeof cur==='object'){set(cur,rest);return;}try{Object.defineProperty(o,p,{get:function(){return cur},set:function(nv){cur=nv;if(nv&&typeof nv==='object')set(nv,rest)},configurable:true})}catch(e){}}set(window,chain);})();`;
  },
  // Stäng av WebRTC (hindrar IP-läckage/spårning via RTCPeerConnection)
  'nowebrtc': () => `(function(){var n=function(){throw new Error('WebRTC avstängt')};['RTCPeerConnection','webkitRTCPeerConnection','mozRTCPeerConnection'].forEach(function(k){try{if(window[k])window[k]=n}catch(e){}});})();`,
  // Ta bort attribut från matchande element (vid start + på ändringar)
  'remove-attr': (a) => {
    const [attr, sel] = a; if (!attr) return '';
    return `(function(){var attrs=${S(attr)}.split('|'),sel=${sel?S(sel):'null'};function run(){try{var q=sel||('['+attrs.join('],[')+']');document.querySelectorAll(q).forEach(function(el){attrs.forEach(function(x){el.removeAttribute(x)})})}catch(e){}}run();try{new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true,attributes:true})}catch(e){}document.addEventListener('DOMContentLoaded',run);})();`;
  },
  // Ta bort klass från matchande element
  'remove-class': (a) => {
    const [kl, sel] = a; if (!kl) return '';
    return `(function(){var classes=${S(kl)}.split('|'),sel=${sel?S(sel):'null'};function run(){try{var q=sel||('.'+classes.join(',.'));document.querySelectorAll(q).forEach(function(el){classes.forEach(function(c){el.classList.remove(c)})})}catch(e){}}run();try{new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true,attributes:true})}catch(e){}document.addEventListener('DOMContentLoaded',run);})();`;
  },
  // Sätt en cookie
  'set-cookie': (a) => {
    const [namn, varde] = a; if (!namn) return '';
    return `(function(){try{document.cookie=${S(namn)}+'='+${S(varde)}+'; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT';}catch(e){}})();`;
  },
  'set-local-storage-item': (a) => {
    const [namn, varde] = a; if (!namn) return '';
    return `(function(){try{localStorage.setItem(${S(namn)},${S(varde)})}catch(e){}})();`;
  },
  'set-session-storage-item': (a) => {
    const [namn, varde] = a; if (!namn) return '';
    return `(function(){try{sessionStorage.setItem(${S(namn)},${S(varde)})}catch(e){}})();`;
  },
  // Rensa properties ur JSON.parse-resultat (spårningssvar)
  'json-prune': (a) => {
    const [bort] = a;
    return `(function(){var props=${S(bort||'')}.split(' ').filter(Boolean);if(!props.length)return;function prune(o){if(!o||typeof o!=='object')return o;props.forEach(function(p){var path=p.split('.');var cur=o;for(var i=0;i<path.length-1;i++){cur=cur&&cur[path[i]]}if(cur&&typeof cur==='object')try{delete cur[path[path.length-1]]}catch(e){}});return o;}var oj=JSON.parse;JSON.parse=function(){var r=oj.apply(this,arguments);try{return prune(r)}catch(e){return r}};})();`;
  },
  // Hindra window.open som matchar
  'no-window-open-if': (a) => {
    const [monster] = a;
    const neg = monster && monster[0] === '!';
    const m = neg ? monster.slice(1) : monster;
    return `(function(){var re=${m?regexKod(m):'/.?/'},neg=${neg?'true':'false'};var o=window.open;window.open=function(u){try{var matchar=re.test(String(u||''));if(neg)matchar=!matchar;if(matchar)return null;}catch(e){}return o.apply(this,arguments);};})();`;
  },
};

// Alias → kanoniskt namn
const ALIAS = {
  'set': 'set-constant', 'aopr': 'abort-on-property-read', 'aopw': 'abort-on-property-write',
  'aeld': 'addEventListener-defuser', 'nostif': 'no-setTimeout-if', 'setTimeout-defuser': 'no-setTimeout-if',
  'nosiif': 'no-setInterval-if', 'setInterval-defuser': 'no-setInterval-if',
  'acs': 'abort-current-script', 'acis': 'abort-current-script', 'abort-current-inline-script': 'abort-current-script',
  'ra': 'remove-attr', 'rc': 'remove-class', 'nowoif': 'no-window-open-if',
};

function kodFor(str) {
  const delar = dela(str);
  let namn = (delar.shift() || '').replace(/\.js$/, '');
  namn = ALIAS[namn] || namn;
  const fn = KIT[namn];
  if (!fn) return '';
  try { return fn(delar) || ''; } catch { return ''; }
}

// Bygg ihop all scriptlet-kod för en värd till en sträng (varje i egen try/catch)
function bygg(scriptletStrings) {
  if (!Array.isArray(scriptletStrings) || !scriptletStrings.length) return '';
  const bitar = [];
  for (const s of scriptletStrings) {
    const kod = kodFor(s);
    if (kod) bitar.push('try{' + kod + '}catch(e){}');
  }
  if (!bitar.length) return '';
  return "(function(){'use strict';" + bitar.join('') + '})();';
}

module.exports = { bygg, kodFor };
