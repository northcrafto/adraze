// AdRaze-scriptlet adjust-setTimeout: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  var F = [
    function adjustSetTimeout(nal, fordrojning, faktor) {
        const re = arRe(nal || "");
        let d = fordrojning !== "*" ? parseInt(fordrojning, 10) : -1;
        if (isNaN(d) || !isFinite(d)) d = 1000;
        let k = parseFloat(faktor);
        k = !isNaN(k) && isFinite(k) ? Math.min(Math.max(k, 0.001), 50) : 0.05;
        const fts = Function.prototype.toString;
        window.setTimeout = new Proxy(window.setTimeout, {
          apply(f, detta, args) {
            try {
              const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
              if ((d === -1 || +args[1] === d) && re.test(kod)) args[1] = (+args[1] || 0) * k;
            } catch (e) {}
            return Reflect.apply(f, detta, args);
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
