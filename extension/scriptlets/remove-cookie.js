// AdRaze-scriptlet remove-cookie: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"/DeviceID|lpe/"],[0,"/^/"],[0,"/^ev_did|ev_sid/"],[0,"/__adblocker|ccuid/"],[0,"/abd/"],[0,"/vs|to|vs_spon|tgpOut|current_click/"],[0,"DeviceID"],[0,"PHPSESSID"],[0,"PageCount"],[0,"__adblocker"],[0,"_adblockerdetected"],[0,"ab"],[0,"articleLimitDrawerVisible"],[0,"article_count"],[0,"da325"],[0,"didomi_token"],[0,"dns_cookie"],[0,"kpwc"],[0,"mvx_consult"],[0,"pageViews"],[0,"popup"],[0,"qusnyQusny"],[0,"read_articles"],[0,"ref_cookie"],[0,"search_curday"],[0,"unauthenicatedArticleLimitReached"],[0,"videoPlayedNumber"],[0,"video_view_count"],[0,"visit"],[0,"wordpress_sezz_id"],[0,"zonck"],[0]],"v":{"ac-illust.com":[24],"adultasianporn.com":[1],"azmen.com":[26],"blick.ch":[9],"cbr.com":[12,25],"derstandard.at":[30],"derstandard.de":[30],"embed.wcostream.com":[7],"fempers.se":[13,22,29],"fullxh.com":[27],"goplay.su":[4],"gsmarena.com":[0,6],"jetpunk.com":[8],"jungefreiheit.de":[20],"kleinezeitung.at":[9],"landetsfria.se":[13,22,29],"laurelberninteriors.com":[3],"madewell.com":[16],"megaxh.com":[27],"moneyvox.fr":[18],"nexusmods.com":[11],"novagente.pt":[28],"photo-ac.com":[24],"scmp.com":[9],"seexh.com":[27],"sexvideos.host":[5],"seznam.cz":[21],"stackshare.io":[19],"subdivx.com":[23],"synonymer.se":[2],"technologyreview.jp":[17],"tidningenglobal.se":[13,22,29],"tidningensyre.se":[13,22,29],"tv5mondeplus.com":[15],"unlockxh4.com":[27],"workers.dev":[10],"xhaccess.com":[27],"xhadult2.com":[27],"xhadult3.com":[27],"xhamsterporno.mx":[27],"xhbig.com":[27],"xhbranch5.com":[27],"xhchannel.com":[27],"xhdate.world":[27],"xhlease.world":[27],"xhmoon5.com":[27],"xhofficial.com":[27],"xhopen.com":[27],"xhplanet1.com":[27],"xhplanet2.com":[27],"xhreal2.com":[27],"xhreal3.com":[27],"xhspot.com":[27],"xhtotal.com":[27],"xhtree.com":[27],"xhvictory.com":[27],"xhwebsite.com":[27],"xhwebsite5.com":[27],"xhwide5.com":[27],"xxxxsx.com":[31],"zootube1.com":[14]},"u":{}};
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
