// AdRaze-scriptlet json-prune: genererad av tools/build.js från filterlistornas ##+js-filter.
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

  var F = [
    function jsonPrune(bort, nalar) {
        if (!bort) return;
        const vagar = bort.split(/ +/).filter(Boolean);
        const krav = nalar ? nalar.split(/ +/).filter(Boolean) : [];
        const hitta = (rot, vag, rensa) => {
          let agare = rot, k = vag;
          for (;;) {
            if (typeof agare !== "object" || agare === null) return false;
            const i = k.indexOf(".");
            if (i === -1) {
              if (!rensa) return Object.prototype.hasOwnProperty.call(agare, k);
              let andrat = false;
              if (k === "*") { for (const n of Object.keys(agare)) { delete agare[n]; andrat = true; } }
              else if (Object.prototype.hasOwnProperty.call(agare, k)) { delete agare[k]; andrat = true; }
              return andrat;
            }
            const prop = k.slice(0, i), nasta = k.slice(i + 1);
            let hittat = false;
            if (prop === "[-]" && Array.isArray(agare)) {
              for (let j = agare.length - 1; j >= 0; j--) if (hitta(agare[j], nasta, false)) { agare.splice(j, 1); hittat = true; }
              return hittat;
            }
            if (prop === "{-}" && agare instanceof Object) {
              for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, false)) { delete agare[n]; hittat = true; }
              return hittat;
            }
            if ((prop === "[]" && Array.isArray(agare)) || ((prop === "{}" || prop === "*") && agare instanceof Object)) {
              for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, rensa)) hittat = true;
              return hittat;
            }
            if (!Object.prototype.hasOwnProperty.call(agare, prop)) return false;
            agare = agare[prop];
            k = nasta;
          }
        };
        JSON.parse = new Proxy(JSON.parse, {
          apply(f, detta, args) {
            const obj = Reflect.apply(f, detta, args);
            try { if (krav.every((n) => hitta(obj, n, false))) for (const v of vagar) hitta(obj, v, true); } catch (e) {}
            return obj;
          },
        });
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
