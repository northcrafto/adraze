// AdRaze-scriptlet set-session-storage-item: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"","true"],[0,"/^ta_/","$remove$"],[0,"1024teradl:fetch-click-count","1"],[0,"HPLWClosedPerSessionCount","1"],[0,"TandemWeb.BlogPopupShown","true"],[0,"_x9f2e_20251112","true"],[0,"_x_popped","{}"],[0,"adViewed","true"],[0,"adblockDismissed","1"],[0,"ag-forced-auth-modal-displayed","true"],[0,"altses","false"],[0,"anixtv_bookmark_shown","true"],[0,"anonSessionNotific","1"],[0,"arena-bottom-drawer","true"],[0,"backCallPopupIsShown","1"],[0,"bannerClosed","true"],[0,"barcelona_mobile_upsell_state","1"],[0,"bellesa_show_slideout","false"],[0,"bonusIcon","false"],[0,"bookingSearchAlreadyOpened","true"],[0,"canShowSubscribe","2"],[0,"chillflix:community-prompt-session","1"],[0,"closeIntentModalShown","1"],[0,"cmsPopupShown","true"],[0,"coachmarkShown","true"],[0,"countPageSeen","$remove$"],[0,"discpopshown","true"],[0,"ecomsend_pp_already_show211873","true"],[0,"ecomsend_pp_already_show250959","true"],[0,"ecomsend_pp_window_normal211873","true"],[0,"elg_lp_seen_call","1"],[0,"embibeApp.smartBanner.landingHome","true"],[0,"enews_popup_session","1"],[0,"floating-sign-up-dismissed","true"],[0,"footer-notification","false"],[0,"freeshippingShown","1"],[0,"fs","1"],[0,"fs.adb6512.dis","1"],[0,"gaming-modal-shown","true"],[0,"guest-pro","true"],[0,"hasShowTouchLoginWall","true"],[0,"hasViewedReduceNotifications","true"],[0,"hidePopup","true"],[0,"isAvailableSmartBanner","false"],[0,"isOpenedLiveClassBanner","false"],[0,"kw_ad_clicks","2"],[0,"kw_ad_shown","5"],[0,"loggedOutCTAIsShown","1"],[0,"md_popup_clicks","null"],[0,"md_popup_shown","1"],[0,"modal-dismissed-mail-plus-intro-exit-intent","true"],[0,"modal-newsletter","false"],[0,"modalViewed","true"],[0,"newsletter-modal-seen","true"],[0,"omr-reviews-login-incentive-seen","1"],[0,"pharmaLeaveIntentPopup","true"],[0,"popup","1"],[0,"popup-closed","true"],[0,"pro_promote_v2_shown","true"],[0,"realm.Oidc.3pc","$remove$"],[0,"regRequested","true"],[0,"sfm-gofundmepro-closed","true"],[0,"shouldShowAuthBannerAfterQuery","false"],[0,"showBottomBanner","false"],[0,"showEventsBanner","false"],[0,"signUpBannerDismissed","true"],[0,"socialProofDisabled","1"],[0,"sr_s","1"],[0,"sw-notification-modal-swag-custom-notifications-newsletter-popup","1"],[0,"telegram_popup_v1","true"],[0,"umggr-newsletter-first-load","true"],[0,"welcomeModalClosed","true"]],"v":{"1024teradl.com":[2],"1mg.com":[55],"adidas.ua":[20],"ag.mos.ru":[9],"anixtv.in":[11],"anixtv.pro":[11],"anixtv.us.cc":[11],"anixx.fun":[11],"baltbet.ru":[60],"baseball-reference.com":[67],"bcliquorstores.com":[32],"beeline.ru":[14],"bellesa.co":[17],"bleachernation.com":[37],"brawlify.com":[1],"bsky.app":[71],"chillflix.lol":[21],"discordservers.com":[34],"docsity.com":[22],"dramaflix.cc":[69],"dream.ai":[41],"elgroup-market.ru":[30],"embibe.com":[31,43,44],"eminem.com":[70],"eneba.com":[66],"expressnews.com":[59],"fantasyfootballhub.co.uk":[52],"feber.se":[36],"flipkart.com":[3],"footmercato.net":[25],"getstronganimals.com":[35],"grupoahora.net.br":[56],"hetzner.com":[58],"ibena.shop":[68],"ifixit.com":[53],"imdb.com":[24],"instagram.com":[47],"internxt.com":[63],"kawaii-anime.com":[45,46],"macpaw.com":[38],"makemytrip.com":[10],"mallofistanbul.com.tr":[23],"maltadaily.mt":[48,49],"maxicours.com":[57],"moneycontrol.com":[7],"myjewishlearning.com":[61],"neoxsoftworks.eu":[8],"njavtv.com":[6],"northcasino.com":[12],"novapost.com":[15],"oddsportal.com":[18],"omr.com":[54],"perplexity.ai":[62,65],"powder.com":[13],"proton.me":[50],"qwertee.com":[42],"ringover.com":[64],"selenagomez.com":[70],"semafor.com":[33],"sfchronicle.com":[59],"shop.deeper.network":[28],"spencerdevs.xyz":[26],"streamscharts.com":[39],"tandem.net":[4],"th.gl":[5],"threads.com":[16],"titan-army.com":[27,29],"tjock.se":[36],"upbeatcode.com":[0],"wizzair.com":[19],"www.kinopoisk.ru":[40],"zonealarm.com":[51]},"u":{}};
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
