// AdRaze-scriptlet href-sanitizer: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"a[href*=\"&amp;u\"]","?amp;u"],[0,"a[href*=\"&cpdir\"]","?cpdir"],[0,"a[href*=\"&ued=\"]","?ued"],[0,"a[href*=\".io/c/\"]","?u"],[0,"a[href*=\".pxf.io\"]","?u"],[0,"a[href*=\".sjv.io\"]","?u"],[0,"a[href*=\"/click\"]","?url"],[0,"a[href*=\"/idg.digidip.net/\"]","?url"],[0,"a[href*=\"/t?a=\"]","?url"],[0,"a[href^=\"/p/download.html?ntlruby=\"]","?ntlruby"],[0,"a[href^=\"https://azrom.net/\"][href*=\"?url=\"]","?url"],[0,"a[href^=\"https://cdns.6hiidude.gold/file.php?link=http\"]","?link"],[0,"a[href^=\"https://link.asiaon.top/full?api=\"][href*=\"&url=aHR0c\"]","?url -base64"],[0,"a[href^=\"https://toonhub4u.com/redirect/\"]","?url -base64"],[0,"a[href^=\"https://www.adtival.network/\"][href*=\"&url=\"]","?url"]],"v":{"6hiidude.gold":[11],"aftonbladet.se":[8],"allas.se":[3],"asiaon.top":[12],"asiaontop.com":[12],"azrom.net":[10],"byggahus.se":[8],"elle.se":[3,6,8],"expressen.se":[0,2,4,5,6,8],"familjeliv.se":[8],"femina.se":[3,8],"galamagasin.se":[8],"golflivet.se":[8],"hant.se":[3],"inredningsvis.se":[8],"kazefuri.net":[14],"leta.se":[1],"m3.se":[7],"mabra.com":[3],"macworld.se":[7],"motherhood.se":[3],"pcforalla.se":[7],"residencemagazine.se":[3],"rodeo.net":[8],"svenskdam.se":[3,8],"taisachonthi.com":[9],"toonhub4u.me":[13],"vitaestilo.se":[8]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;
  function arNar(fn, lage) {
      const ordning = { loading: 1, interactive: 2, complete: 3 };
      const mal = ordning[lage] || 2;
      if ((ordning[document.readyState] || 1) >= mal) { fn(); return; }
      const lyss = () => {
        if ((ordning[document.readyState] || 1) < mal) return;
        document.removeEventListener("readystatechange", lyss, true);
        fn();
      };
      document.addEventListener("readystatechange", lyss, true);
    }
  var F = [
    function hrefSanitizer(sel, kalla) {
        if (!sel) return;
        kalla = kalla || "text";
        const giltig = (t) => {
          if (typeof t !== "string" || !t || /[\x00-\x20\x7f]/.test(t)) return "";
          try { const u = new URL(t, document.location); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (e) { return ""; }
        };
        const param = (href, k) => {
          if (!k) return href;
          const nasta = k.indexOf("?", 1);
          const namn = k.slice(1, nasta === -1 ? k.length : nasta);
          try {
            const v = new URL(href, document.location).searchParams.get(namn);
            if (v === null) return "";
            return nasta === -1 ? v.replace(/ /g, "%20") : param(v, k.slice(nasta));
          } catch (e) { return ""; }
        };
        const adress = (el) => {
          if (/^\[.*\]$/.test(kalla)) return el.getAttribute(kalla.slice(1, -1).trim()) || "";
          if (kalla === "text") return el.textContent.replace(/^[^\x21-\x7e]+/, "").replace(/[^\x21-\x7e]+$/, "");
          if (kalla.startsWith("?")) return param(el.href, kalla);
          return "";
        };
        const tvatta = () => {
          let lankar;
          try { lankar = document.querySelectorAll(sel); } catch (e) { return false; }
          for (const el of lankar) {
            if (el.localName !== "a" || !el.hasAttribute("href")) continue;
            const ny = giltig(adress(el));
            if (ny && ny !== el.getAttribute("href")) el.setAttribute("href", ny);
          }
          return true;
        };
        arNar(() => {
          if (!tvatta() || !document.body) return;
          let vantar = false;
          new MutationObserver((andr) => {
            if (vantar || !andr.some((a) => [...a.addedNodes].some((n) => n.nodeType === 1))) return;
            vantar = true;
            setTimeout(() => { vantar = false; tvatta(); }, 50);
          }).observe(document.body, { childList: true, subtree: true });
        }, "interactive");
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
