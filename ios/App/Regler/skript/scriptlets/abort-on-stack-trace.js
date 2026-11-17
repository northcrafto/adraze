// AdRaze-scriptlet abort-on-stack-trace: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arAvbrott() {
      if (!arAvbrott.text) {
        arAvbrott.text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
        window.addEventListener("error", (e) => { if (String(e.message).includes(arAvbrott.text)) e.preventDefault(); }, true);
      }
      return new ReferenceError(arAvbrott.text);
    }
  function arStack(m) {
      const fel = new Error(arAvbrott().message);
      const sida = location.href.split("#")[0];
      const rader = [];
      for (let rad of String(fel.stack).split(/[\n\r]+/)) {
        rad = rad.trim();
        const t = /(.*?@)?(\S+)(:\d+):\d+\)?$/.exec(rad);
        if (!t) continue;
        let url = t[2];
        if (url.startsWith("(")) url = url.slice(1);
        if (url === sida) url = "inlineScript";
        else if (url.startsWith("<anonymous>")) url = "injectedScript";
        let fn = t[1] !== undefined ? t[1].slice(0, -1) : rad.slice(0, t.index).trim();
        if (fn.startsWith("at")) fn = fn.slice(2).trim();
        rader.push(" " + (fn + " " + url + t[3] + ":1").trim());
      }
      rader[0] = "stackDepth:" + (rader.length - 1);
      return arTraffar(m, rader.join("\t"));
    }
  var F = [
    function abortOnStackTrace(kedja, nal) {
        if (!kedja) return;
        const m = arMonster(nal || "");
        if (m.tomt) return;
        const proxy = (agare, k) => {
          const i = k.indexOf(".");
          if (i === -1) {
            let v = agare[k];
            try {
              Object.defineProperty(agare, k, {
                get() { if (arStack(m)) throw arAvbrott(); return v; },
                set(a) { if (arStack(m)) throw arAvbrott(); v = a; },
              });
            } catch (e) {}
            return;
          }
          const prop = k.slice(0, i), rest = k.slice(i + 1);
          let v = agare[prop];
          if (v) { proxy(v, rest); return; }
          const d = Object.getOwnPropertyDescriptor(agare, prop);
          if (d && d.set !== undefined) return;
          try {
            Object.defineProperty(agare, prop, {
              get() { return v; },
              set(a) { v = a; if (a instanceof Object) proxy(a, rest); },
            });
          } catch (e) {}
        };
        proxy(window, kedja);
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
