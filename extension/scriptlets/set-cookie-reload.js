// AdRaze-scriptlet set-cookie-reload: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"MarifetBanner","true"],[0,"ZEPHR_NEWSLETTER_ALLOCATION","true"],[0,"_geps","true"],[0,"_showed_informer","1"],[0,"adblock","1"],[0,"admbenefits","1"],[0,"articleLimitCooldown","true"],[0,"closing-banner","1"],[0,"disallowPrepawayBanner","1"],[0,"donate","1"],[0,"exitPopup","true"],[0,"hide-epbadprom","1"],[0,"hide_tg_gift_v2","1"],[0,"housearch_popup_shown","yes"],[0,"hustle-hide-module-10","10"],[0,"hustle-hide-module-2","2"],[0,"iqitpopup_35251","1"],[0,"iqitpopup_8234","1"],[0,"isPopupClosed","1"],[0,"logged_in","1"],[0,"login_popup_displayed","false"],[0,"macpaw_amidst_aggression-hide","1"],[0,"new_overlay_uchazeci_open","1"],[0,"newsletter_signup_promo","true"],[0,"no_reg2_popup","1"],[0,"notification_subscription","false"],[0,"nsdr","1"]],"v":{"androidpolice.com":[6],"babylonbee.com":[2],"bankbazaar.com":[25],"briefmenow.org":[8,18],"fajn-brigady.cz":[22],"fireweatheravalanche.org":[9],"foxbusiness.com":[5],"foxnews.com":[5],"hotcars.com":[6],"igotoworld.com":[7],"infourok.ru":[12],"justetf.com":[11],"machow2.com":[15],"macpaw.com":[21],"mealty.ru":[24],"networkworld.com":[26],"petri.com":[14],"pocket-lint.com":[6],"pornone.com":[4],"qiita.com":[20],"realty.ya.ru":[13],"snopes.com":[23],"spectator.co.uk":[1],"sportmo.shop":[16,17],"sqmagazine.co.uk":[10],"teb.com.tr":[0],"tumblr.com":[19],"uralairlines.ru":[3]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;
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
    function setCookieReload(namn, varde, sokvag) {
        if (!namn || varde === undefined || !arSakertVarde(varde, 32767)) return;
        if (/[^!#$&+\-.^_`|~0-9A-Za-z]/.test(namn)) namn = encodeURIComponent(namn);
        if (/[^ -:<-[\]-~]/.test(varde)) varde = encodeURIComponent(varde);
        const las = () => {
          for (const bit of document.cookie.split(/\s*;\s*/)) {
            const i = bit.indexOf("=");
            if (i !== -1 && bit.slice(0, i) === namn) return bit.slice(i + 1);
          }
        };
        if (las() === varde) return;
        sokvag = sokvag || "/";
        if (sokvag !== "/" && sokvag !== "none") return;
        try { document.cookie = namn + "=" + varde + (sokvag === "/" ? "; path=/" : ""); } catch (e) {}
        if (las() === varde) location.reload();
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
