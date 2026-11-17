// AdRaze-scriptlet set-constant: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arExtra(args, fran) {
      const ut = {};
      for (let i = fran; i + 1 < args.length; i += 2) ut[args[i]] = args[i + 1];
      return ut;
    }
  function arAvbrott() {
      if (!arAvbrott.text) {
        arAvbrott.text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
        window.addEventListener("error", (e) => { if (String(e.message).includes(arAvbrott.text)) e.preventDefault(); }, true);
      }
      return new ReferenceError(arAvbrott.text);
    }
  var F = [
    function setConstant(kedja, varde, ...extra) {
        if (!kedja) return;
        let v;
        switch (varde === undefined ? "" : varde) {
          case "undefined": v = undefined; break;
          case "false": v = false; break;
          case "true": v = true; break;
          case "null": v = null; break;
          case "''": case "\"\"": case "": case "emptyStr": v = ""; break;
          case "[]": case "emptyArr": v = []; break;
          case "{}": case "emptyObj": v = {}; break;
          case "noopFunc": v = function () {}; break;
          case "noopCallbackFunc": v = function () { return function () {}; }; break;
          case "trueFunc": v = function () { return true; }; break;
          case "falseFunc": v = function () { return false; }; break;
          case "throwFunc": v = function () { throw arAvbrott(); }; break;
          case "yes": case "no": v = varde; break;
          default:
            if (!/^-?\d+$/.test(varde)) return;
            v = parseInt(varde, 10);
            if (Math.abs(v) > 0x7fff) return;
        }
        const som = arExtra(extra, 0).as;
        if (som === "function") { const w = v; v = function () { return w; }; }
        else if (som === "callback") { const w = v; v = function () { return function () { return w; }; }; }
        else if (som === "resolved") v = Promise.resolve(v);
        else if (som === "rejected") { v = Promise.reject(v); v.catch(() => {}); }
        // Sätter sidan själv ett värde av en annan typ ger vi upp (då är det något annat än vi trodde)
        let gavUpp = false, sidans;
        const fel = (x) => {
          if (gavUpp) return true;
          gavUpp = x !== undefined && x !== null && v !== undefined && v !== null && typeof x !== typeof v;
          return gavUpp;
        };
        const fanga = (agare, prop, konf, h) => {
          if (h.init(konf ? agare[prop] : v) === false) return;
          const d = Object.getOwnPropertyDescriptor(agare, prop);
          let fg, fs;
          if (d instanceof Object) {
            try { agare[prop] = v; } catch (e) {}
            if (d.get instanceof Function) fg = d.get;
            if (d.set instanceof Function) fs = d.set;
          }
          try {
            Object.defineProperty(agare, prop, {
              configurable: konf,
              get() { if (fg !== undefined) fg.call(this); return h.get(); },
              set(a) { if (fs !== undefined) fs.call(this, a); h.set(a); },
            });
          } catch (e) {}
        };
        const kedjaPa = (agare, k) => {
          const i = k.indexOf(".");
          if (i === -1) {
            fanga(agare, k, false, {
              init(x) { return !fel(x); },
              get() { return gavUpp ? sidans : v; },
              set(a) { if (fel(a)) sidans = a; },
            });
            return;
          }
          const prop = k.slice(0, i), rest = k.slice(i + 1);
          const nu = agare[prop];
          if (nu instanceof Object || (typeof nu === "object" && nu !== null)) { kedjaPa(nu, rest); return; }
          let lagrat;
          fanga(agare, prop, true, {
            init(x) { lagrat = x; return true; },
            get() { return lagrat; },
            set(a) { lagrat = a; if (a instanceof Object) kedjaPa(a, rest); },
          });
        };
        kedjaPa(window, kedja);
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
