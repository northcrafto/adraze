// AdRaze-scriptlet remove-class: genererad av tools/build.js från filterlistornas ##+js-filter.
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
    function removeClass(klasser, sel, beteende) {
        if (!klasser) return;
        sel = sel || ""; beteende = beteende || "";
        const namn = klasser.split(/\s*\|\s*/).filter(Boolean);
        const q = sel || namn.map((k) => "." + CSS.escape(k)).join(",");
        const asap = /\basap\b/.test(beteende);
        let vantar = false;
        const kor = () => {
          vantar = false;
          try { for (const el of document.querySelectorAll(q)) el.classList.remove(...namn); } catch (e) {}
        };
        const senare = () => { if (vantar) return; vantar = true; setTimeout(kor, 17); };
        const start = () => {
          kor();
          if (!/\bstay\b/.test(beteende)) return;
          new MutationObserver((andr) => {
            for (const a of andr) {
              if (a.type === "attributes" || [...a.addedNodes].some((n) => n.nodeType === 1)) { if (asap) kor(); else senare(); return; }
            }
          }).observe(document, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
        };
        arNar(start, asap ? "loading" : /\bcomplete\b/.test(beteende) ? "complete" : "interactive");
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
