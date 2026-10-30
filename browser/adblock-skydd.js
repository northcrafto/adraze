'use strict';
/* Sidskydd som körs i sidans egen värld före sidans skript (via adraze-preload.js):
 *   fingeravtryck – litet brus i canvas/ljud och neutrala värden för WebGL/hårdvara (som Braves
 *                   "farbling"): samma på en sajt under sessionen, olika mellan sajter
 *   injektioner   – skript som sidan skjuter in i efterhand från ANDRA sajter stoppas (så laddar
 *                   piratsajter sina roterande reklamskript); skripten i själva HTML:en körs som vanligt
 *   ingaKakor     – document.cookie gör ingenting (tredjepartsram när kakor från tredjepart blockeras)
 * Varje funktion ger en kodsträng. */

function fingeravtryck(fro) {
  return `(function(){try{
var S=${fro >>> 0};
function h(i){var x=(S^Math.imul(i+1,0x9E3779B1))>>>0;x^=x>>>16;x=Math.imul(x,0x85EBCA6B)>>>0;x^=x>>>13;return x;}
var gid=CanvasRenderingContext2D.prototype.getImageData;
function brus(d){var n=d.length>>2;if(!n)return d;var steg=Math.max(1,Math.floor(n/64));for(var p=h(0)%steg;p<n;p+=steg){var i=p*4+(h(p)%3);d[i]=d[i]^1;}return d;}
CanvasRenderingContext2D.prototype.getImageData=function(){var r=gid.apply(this,arguments);try{brus(r.data);}catch(e){}return r;};
function kopia(c){try{var w=c.width,hh=c.height;if(!w||!hh||w*hh>4e6)return null;var k=document.createElement('canvas');k.width=w;k.height=hh;var x=k.getContext('2d');x.drawImage(c,0,0);var d=gid.call(x,0,0,w,hh);brus(d.data);x.putImageData(d,0,0);return k;}catch(e){return null;}}
var tdu=HTMLCanvasElement.prototype.toDataURL,tb=HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toDataURL=function(){var k=kopia(this);return tdu.apply(k||this,arguments);};
HTMLCanvasElement.prototype.toBlob=function(){var k=kopia(this);return tb.apply(k||this,arguments);};
if(window.AudioBuffer){var gcd=AudioBuffer.prototype.getChannelData,klar=new WeakSet();
AudioBuffer.prototype.getChannelData=function(){var d=gcd.apply(this,arguments);try{if(!klar.has(d)){klar.add(d);for(var i=h(7)%97;i<d.length;i+=97)d[i]+=((h(i)&255)-128)*1e-9;}}catch(e){}return d;};}
function gl(P){if(!P)return;var gp=P.getParameter;P.getParameter=function(p){if(p===0x9245)return 'Google Inc.';if(p===0x9246)return 'ANGLE (Google, Vulkan 1.3.0, SwiftShader driver)';return gp.apply(this,arguments);};}
gl(window.WebGLRenderingContext&&WebGLRenderingContext.prototype);gl(window.WebGL2RenderingContext&&WebGL2RenderingContext.prototype);
var hc=Math.min(navigator.hardwareConcurrency||4,2+(S%7));
try{Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:function(){return hc;},configurable:true});}catch(e){}
try{Object.defineProperty(Navigator.prototype,'deviceMemory',{get:function(){return 8;},configurable:true});}catch(e){}
}catch(e){}})();`;
}

function injektioner() {
  return `(function(){try{
function bas(h){var d=String(h||'').split('.');return d.length>2&&/^(co|com|org|net|gov|ac|edu)$/.test(d[d.length-2])&&d[d.length-1].length===2?d.slice(-3).join('.'):d.slice(-2).join('.');}
var sajt=bas(location.hostname);
// Vanliga, ofarliga källor som riktiga sajter laddar i efterhand (CDN:er, inloggning, betalning, captcha, video)
var OK=/(^|\\.)(gstatic\\.com|googleapis\\.com|google\\.com|recaptcha\\.net|hcaptcha\\.com|cloudflare\\.com|jsdelivr\\.net|unpkg\\.com|cdnjs\\.com|jquery\\.com|bootstrapcdn\\.com|stripe\\.com|stripe\\.network|paypal\\.com|paypalobjects\\.com|klarna\\.com|klarnacdn\\.net|adyen\\.com|youtube\\.com|ytimg\\.com|vimeo\\.com|vimeocdn\\.com|jwplayer\\.com|jwpcdn\\.com|appleid\\.cdn-apple\\.com|apple\\.com|microsoft\\.com|live\\.com|msauth\\.net|github\\.com|githubassets\\.com|sentry-cdn\\.com|arkoselabs\\.com|funcaptcha\\.com|shopify\\.com|shopifycdn\\.com|cookiebot\\.com|onetrust\\.com|cookielaw\\.org|fontawesome\\.com|typekit\\.net|bankid\\.com|frejaeid\\.com)$/i;
function stopp(n){try{if(!n||n.nodeType!==1||n.tagName!=='SCRIPT')return false;var s=n.getAttribute('src');if(!s)return false;var u=new URL(s,location.href);if(!/^https?:$/.test(u.protocol))return false;var h=u.hostname;if(bas(h)===sajt||OK.test(h))return false;try{document.dispatchEvent(new CustomEvent('adraze-injektion'));}catch(e){}return true;}catch(e){return false;}}
function vakta(P,namn,ix){var f=P[namn];if(!f)return;P[namn]=function(){var a=arguments;for(var i=0;i<a.length;i++){if(ix!==undefined&&i!==ix)continue;if(stopp(a[i]))return a[i];}return f.apply(this,a);};}
vakta(Node.prototype,'appendChild',0);vakta(Node.prototype,'insertBefore',0);vakta(Node.prototype,'replaceChild',0);
['append','prepend','before','after','replaceWith'].forEach(function(m){vakta(Element.prototype,m);});
var iae=Element.prototype.insertAdjacentElement;if(iae)Element.prototype.insertAdjacentElement=function(p,el){if(stopp(el))return el;return iae.apply(this,arguments);};
}catch(e){}})();`;
}

function ingaKakor() {
  return `(function(){try{Object.defineProperty(Document.prototype,'cookie',{get:function(){return '';},set:function(){},configurable:true});}catch(e){}})();`;
}

module.exports = { fingeravtryck, injektioner, ingaKakor };
