// AdRaze-scriptlet addEventListener-defuser: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  var F = [
    function addEventListenerDefuser(typ, monster, ...extra) {
        typ = typ || ""; monster = monster || "";
        if (typ === "" && monster === "") return;
        const reTyp = arRe(typ === "*" ? "" : typ, undefined, true);
        const reMon = arRe(monster === "*" ? "" : monster);
        const element = arExtra(extra, 0).elements;
        const fts = Function.prototype.toString;
        const passar = (detta) => {
          if (!element) return true;
          if (element === "window") return detta === window;
          if (element === "document") return detta === document;
          try { return detta instanceof Element && detta.matches(element); } catch (e) { return false; }
        };
        const fangare = {
          apply(f, detta, args) {
            let t = "", h = "";
            try {
              t = String(args[0]);
              const l = args[1];
              if (typeof l === "function") h = fts.call(l);
              else if (l && typeof l === "object" && typeof l.handleEvent === "function") h = fts.call(l.handleEvent);
              else h = String(l);
            } catch (e) {}
            if (reTyp.test(t) && reMon.test(h) && passar(detta)) return undefined;
            return Reflect.apply(f, detta, args);
          },
        };
        EventTarget.prototype.addEventListener = new Proxy(EventTarget.prototype.addEventListener, fangare);
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
