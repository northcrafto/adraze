// AdRaze-scriptlet no-fetch-if: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arEgenskaper(text) {
      const ut = [];
      if (!text) return ut;
      for (const bit of String(text).split(/\s+/)) {
        if (!bit) continue;
        const i = bit.indexOf(":");
        let namn = i > 0 ? bit.slice(0, i) : "";
        let monster = i > 0 ? bit.slice(i + 1) : bit;
        if (namn && /[^$\w -]/.test(namn)) { namn = ""; monster = bit; }
        ut.push([namn || "url", arMonster(monster)]);
      }
      return ut;
    }
  function arMatchar(nalar, egenskaper) {
      if (!nalar.length) return false;
      for (const [namn, m] of nalar) {
        const v = egenskaper[namn];
        if (v === undefined || !arTraffar(m, v)) return false;
      }
      return true;
    }
  function arSvarText(d) {
      if (!d || d === "emptyStr") return "";
      if (d === "true" || d === "false") return d;
      if (d === "emptyObj") return "{}";
      if (d === "emptyArr") return "[]";
      const m = /^length:(\d+)(?:-(\d+))?$/.exec(d);
      if (m) {
        const min = Math.min(+m[1], 500000);
        const max = m[2] ? Math.min(+m[2], 500000) : min;
        let n = min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));
        let s = "";
        while (s.length < n) s += Math.random().toString(36).slice(2);
        return s.slice(0, n);
      }
      return "";
    }
  var F = [
    function noFetchIf(villkor, svar, typ) {
        const nalar = arEgenskaper(villkor || "");
        if (!nalar.length) return;
        const typer = ["basic", "cors", "default", "error", "opaque"];
        window.fetch = new Proxy(window.fetch, {
          apply(f, detta, args) {
            let detaljer;
            try {
              detaljer = args[0] instanceof Request ? args[0] : Object.assign({ url: String(args[0]) }, args[1]);
              const e = {};
              for (const k in detaljer) {
                let v = detaljer[k];
                if (typeof v !== "string") { try { v = JSON.stringify(v); } catch (x) {} }
                if (typeof v === "string") e[k] = v;
              }
              if (!e.method) e.method = "GET";
              if (!arMatchar(nalar, e)) return Reflect.apply(f, detta, args);
            } catch (x) { return Reflect.apply(f, detta, args); }
            const text = arSvarText(svar);
            const r = new Response(text, { status: 200, statusText: "OK", headers: { "Content-Length": String(text.length) } });
            try {
              const prop = { url: { value: String(detaljer.url || "") } };
              if (typer.includes(typ)) prop.type = { value: typ };
              Object.defineProperties(r, prop);
            } catch (x) {}
            return Promise.resolve(r);
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
