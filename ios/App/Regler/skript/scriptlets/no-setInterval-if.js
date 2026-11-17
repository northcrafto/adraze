// AdRaze-scriptlet no-setInterval-if: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arMonster(monster) {
      monster = monster === undefined || monster === null ? "" : String(monster);
      const inte = monster.charAt(0) === "!";
      return { re: arRe(inte ? monster.slice(1) : monster), inte, tomt: monster === "" };
    }
  function arTraffar(m, text) { return m.re.test(String(text)) !== m.inte; }
  var F = [
    function noSetIntervalIf(nal, fordrojning) {
        nal = nal || ""; fordrojning = fordrojning || "";
        if (nal === "" && fordrojning === "") return;
        const m = arMonster(nal);
        const dInte = fordrojning.charAt(0) === "!";
        const d = fordrojning !== "" ? parseInt(dInte ? fordrojning.slice(1) : fordrojning, 10) : undefined;
        const fts = Function.prototype.toString;
        window.setInterval = new Proxy(window.setInterval, {
          apply(f, detta, args) {
            try {
              const kod = typeof args[0] === "function" ? fts.call(args[0]) : String(args[0]);
              const tid = d === undefined || ((+args[1] || 0) === d) !== dInte;
              if (arTraffar(m, kod) && tid) args[0] = function () {};
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
