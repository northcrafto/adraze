// AdRaze-scriptlet no-window-open-if: genererad av tools/build.js från filterlistornas ##+js-filter.
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
    function noWindowOpenIf(monster, fordrojning) {
        const m = arMonster(monster || "");
        window.open = new Proxy(window.open, {
          apply(f, detta, args) {
            let text = "";
            try { text = Array.prototype.map.call(args, String).join(" "); } catch (e) {}
            if (!arTraffar(m, text)) return Reflect.apply(f, detta, args);
            if (!fordrojning) return null;
            const noop = function () {};
            return new Proxy({ closed: false, close: noop, focus: noop, blur: noop, postMessage: noop,
              document: { write: noop, writeln: noop, open: noop, close: noop }, location: { href: "about:blank", replace: noop, assign: noop } },
            { get: (o, k) => (k in o ? o[k] : noop), set: () => true });
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
