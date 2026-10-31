// AdRaze-scriptlet nobab: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0]],"v":{"adonisfansub.com":[0],"cryptojunkie.net":[0],"cuatrolatastv.blogspot.com":[0],"gamershit.altervista.org":[0],"interfans.org":[0],"itechfever.com":[0],"kolyoom.com":[0],"lyricsongation.com":[0],"penis-bilder.com":[0],"printedwaste.com":[0],"readgraphicnovels.blogspot.com":[0],"senpa.io":[0],"sharing.wtf":[0],"shemalepower.xyz":[0],"tatsumi-crew.net":[0],"techacode.com":[0],"thefreedommatrix.blogspot.com":[0],"unfriend-app.com":[0]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;

  var F = [
    function nobab() {
      const signaturer = [
        ["blockadblock"],
        ["babasbm"],
        [/getItem\('babn'\)/],
        ["getElementById", "String.fromCharCode", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "charAt",
          "DOMContentLoaded", "AdBlock", "addEventListener", "doScroll", "fromCharCode", "<<2|r>>4", "sessionStorage",
          "clientWidth", "localStorage", "Math", "random"],
      ];
      const kanns = (s) => {
        for (const t of signaturer) {
          let n = 0;
          for (const x of t) if ((x instanceof RegExp ? s.search(x) : s.indexOf(x)) !== -1) n++;
          if (n / t.length >= 0.8) return true;
        }
        return false;
      };
      window.eval = new Proxy(window.eval, {
        apply(f, detta, args) {
          const a = args[0];
          if (typeof a !== "string" || !kanns(a)) return Reflect.apply(f, detta, args);
          if (document.body) document.body.style.removeProperty("visibility");
          const el = document.getElementById("babasbmsgx");
          if (el) el.remove();
        },
      });
      window.setTimeout = new Proxy(window.setTimeout, {
        apply(f, detta, args) {
          const a = args[0];
          if (typeof a !== "string" || !/\.bab_elementid.$/.test(a)) return Reflect.apply(f, detta, args);
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
