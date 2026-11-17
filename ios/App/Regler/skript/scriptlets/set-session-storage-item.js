// AdRaze-scriptlet set-session-storage-item: genererad av tools/build.js från filterlistornas ##+js-filter.
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
  function arSakertVarde(v, tal) {
      const SAKRA = ["accept", "reject", "accepted", "rejected", "notaccepted", "allow", "disallow", "deny", "allowed", "denied",
        "approved", "disapproved", "checked", "unchecked", "dismiss", "dismissed", "enable", "disable", "enabled", "disabled",
        "essential", "nonessential", "forbidden", "forever", "hide", "hidden", "necessary", "required", "ok", "on", "off",
        "true", "t", "false", "f", "yes", "y", "no", "n", "all", "none", "functional", "granted", "done", "decline", "declined",
        "closed", "next", "mandatory", "disagree", "agree"];
      const n = String(v).toLowerCase();
      const m = /^("?)(.+)\1$/.exec(n);
      const u = (m && m[2]) || n;
      if (SAKRA.includes(u)) return true;
      if (!/^-?\d+$/.test(u)) return false;
      const x = parseInt(u, 10) || 0;
      return x >= -tal && x <= tal;
    }
  var F = [
    function setSessionStorageItem(nyckel, varde) {
        if (!nyckel) return;
        varde = varde === undefined ? "" : varde;
        if (varde === "emptyArr") varde = "[]"; else if (varde === "emptyObj") varde = "{}";
        if (!["", "undefined", "null", "{}", "[]", "\"\"", "$remove$"].includes(varde) && !arSakertVarde(varde, 32767)) return;
        try {
          const s = window.sessionStorage;
          if (varde === "$remove$") {
            const re = arRe(nyckel, undefined, true), bort = [];
            for (let i = 0; i < s.length; i++) { const k = s.key(i); if (re.test(k)) bort.push(k); }
            for (const k of bort) s.removeItem(k);
          } else s.setItem(nyckel, varde);
        } catch (e) {}
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
