// AdRaze-scriptlet remove-node-text: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arRe(monster, flaggor, exakt) {
      if (monster === undefined || monster === null || monster === "") return /^/;
      const m = /^\/(.+)\/([dgimsuvy]*)$/.exec(monster);
      if (m) { try { return new RegExp(m[1], m[2]); } catch (e) { return /[^\s\S]/; } }
      const t = String(monster).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(exakt ? "^" + t + "$" : t, flaggor);
    }
  function arExtra(args, fran) {
      const ut = {};
      for (let i = fran; i + 1 < args.length; i += 2) ut[args[i]] = args[i + 1];
      return ut;
    }
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
    function removeNodeText(nodnamn, innehaller, ...extra) {
        if (!nodnamn) return;
        const x = arExtra(extra, 0);
        const reNamn = arRe(nodnamn, "i", true);
        const reInne = arRe(innehaller || x.includes || x.condition || "", "ms");
        const reUtom = x.excludes ? arRe(x.excludes, "ms") : null;
        let tt = { createScript: (s) => s };
        try {
          if (window.trustedTypes && typeof trustedTypes.getPropertyType === "function" && trustedTypes.getPropertyType("script", "textContent") === "TrustedScript") {
            tt = trustedTypes.createPolicy("adraze" + Math.random().toString(36).slice(2), { createScript: (s) => s });
          }
        } catch (e) {}
        const behandla = (n) => {
          if (n === document.currentScript) return;
          const fore = n.textContent;
          if (!fore || !reInne.test(fore) || (reUtom && reUtom.test(fore))) return;
          try { n.textContent = n.nodeName === "SCRIPT" ? tt.createScript("") : ""; } catch (e) {}
        };
        // Parsern lägger ibland in <script> tomt och texten strax efter: pröva då elementet när texten kommer
        const nod = (n) => {
          if (reNamn.test(n.nodeName)) behandla(n);
          else if (n.nodeType === 3 && n.parentNode && reNamn.test(n.parentNode.nodeName)) behandla(n.parentNode);
        };
        const obs = new MutationObserver((andr) => { for (const a of andr) for (const n of a.addedNodes) nod(n); });
        obs.observe(document, { childList: true, subtree: true });
        if (document.documentElement) {
          const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) nod(n);
        }
        if (x.stay) return;
        arNar(() => {
          const sluta = () => { for (const a of obs.takeRecords()) for (const n of a.addedNodes) nod(n); obs.disconnect(); };
          const efter = parseInt(x.quitAfter, 10) || 0;
          if (efter) setTimeout(sluta, efter); else sluta();
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
