// AdRaze-scriptlet popads-dummy: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0]],"v":{"3movs.com":[0],"dump.xxx":[0],"fuqer.com":[0],"imgcloud.pw":[0],"namethatporn.com":[0],"pornhd.com":[0],"pornomico.com":[0],"pornoxo.com":[0],"realgfporn.com":[0],"smutr.com":[0],"tranny.one":[0],"turbobit.net":[0],"xcafe.com":[0]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;

  var F = [
    function popadsDummy() {
      try { delete window.PopAds; delete window.popns; } catch (e) {}
      try { Object.defineProperties(window, { PopAds: { value: {} }, popns: { value: {} } }); } catch (e) {}
    }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
