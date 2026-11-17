// AdRaze-scriptlet nofab: genererad av tools/build.js från filterlistornas ##+js-filter.
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
    function nofab() {
      const noop = function () {};
      const Fab = function () {};
      Fab.prototype.check = noop;
      Fab.prototype.clearEvent = noop;
      Fab.prototype.emitEvent = noop;
      Fab.prototype.on = function (a, b) { if (!a) b(); return this; };
      Fab.prototype.onDetected = function () { return this; };
      Fab.prototype.onNotDetected = function (a) { a(); return this; };
      Fab.prototype.setOption = noop;
      Fab.prototype.options = { set: noop, get: noop };
      const fab = new Fab();
      const satt = (namn, v) => {
        try {
          if (Object.prototype.hasOwnProperty.call(window, namn)) window[namn] = v;
          else Object.defineProperty(window, namn, { get() { return v; }, set() {} });
        } catch (e) {}
      };
      for (const n of ["FuckAdBlock", "BlockAdBlock", "SniffAdBlock"]) satt(n, Fab);
      for (const n of ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"]) satt(n, fab);
    }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
