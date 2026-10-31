// AdRaze-scriptlet popads.net: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0]],"v":{"imgshots.com":[0]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;
  function arAvbrott() {
      if (!arAvbrott.text) {
        arAvbrott.text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
        window.addEventListener("error", (e) => { if (String(e.message).includes(arAvbrott.text)) e.preventDefault(); }, true);
      }
      return new ReferenceError(arAvbrott.text);
    }
  var F = [
    function popadsNet() {
      const kasta = () => { throw arAvbrott(); };
      try { delete window.PopAds; delete window.popns; } catch (e) {}
      try { Object.defineProperties(window, { PopAds: { set: kasta }, popns: { set: kasta } }); } catch (e) {}
    }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
