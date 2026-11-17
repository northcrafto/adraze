// AdRaze-scriptlet abort-current-script: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arAvbrott() {
      if (!arAvbrott.text) {
        arAvbrott.text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
        window.addEventListener("error", (e) => { if (String(e.message).includes(arAvbrott.text)) e.preventDefault(); }, true);
      }
      return new ReferenceError(arAvbrott.text);
    }
  var F = [
    function abortCurrentScript(mal, nal, sammanhang) {
        if (!mal) return;
        const reNal = arRe(nal || "");
        const reSam = arRe(sammanhang || "");
        const delar = mal.split(".");
        let agare = window, prop;
        for (;;) {
          prop = delar.shift();
          if (!delar.length) break;
          if (!(prop in agare)) break;
          agare = agare[prop];
          if (!(agare instanceof Object)) return;
        }
        let varde, d = Object.getOwnPropertyDescriptor(agare, prop);
        if (!(d instanceof Object) || !(d.get instanceof Function)) { varde = agare[prop]; d = undefined; }
        const textAv = Object.getOwnPropertyDescriptor(Node.prototype, "textContent").get;
        const texter = new WeakMap();
        const skriptText = (el) => {
          let t = textAv.call(el);
          if (t.trim() !== "") return t;
          if (texter.has(el)) return texter.get(el);
          const [, mime, inne] = /^data:([^,]*),(.+)$/.exec(String(el.src).trim()) || ["", "", ""];
          try { t = mime.endsWith(";base64") ? atob(inne) : decodeURIComponent(inne); } catch (e) {}
          texter.set(el, t);
          return t;
        };
        const prova = () => {
          const el = document.currentScript;
          if (!(el instanceof HTMLScriptElement)) return;
          if (sammanhang && !reSam.test(el.src)) return;
          if (!reNal.test(skriptText(el))) return;
          throw arAvbrott();
        };
        try {
          Object.defineProperty(agare, prop, {
            get() { prova(); return d ? d.get.call(agare) : varde; },
            set(a) { prova(); if (d) { if (d.set) d.set.call(agare, a); } else varde = a; },
          });
        } catch (e) {}
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
