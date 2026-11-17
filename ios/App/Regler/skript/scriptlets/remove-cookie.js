// AdRaze-scriptlet remove-cookie: genererad av tools/build.js från filterlistornas ##+js-filter.
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
    function removeCookie(nal) {
        const re = arRe(nal || "");
        const ta = () => {
          for (const bit of document.cookie.split(";")) {
            const i = bit.indexOf("=");
            if (i === -1) continue;
            const namn = bit.slice(0, i).trim();
            if (!re.test(namn)) continue;
            const h = location.hostname, slut = "; Max-Age=-1000; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            const dom = ["", "; domain=" + h, "; domain=." + h];
            if (h.startsWith("www.")) dom.push("; domain=" + h.slice(3));
            for (const d of dom) for (const p of ["", "; path=/"]) { try { document.cookie = namn + "=" + d + p + slut; } catch (e) {} }
          }
        };
        ta();
        window.addEventListener("beforeunload", ta);
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
