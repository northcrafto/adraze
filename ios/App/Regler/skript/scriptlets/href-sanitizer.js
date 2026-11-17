// AdRaze-scriptlet href-sanitizer: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = __ADRAZE_D__;
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
