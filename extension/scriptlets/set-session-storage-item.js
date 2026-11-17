// AdRaze-scriptlet set-session-storage-item: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"","true"],[0,"/^ta_/","$remove$"],[0,"1024teradl:fetch-click-count","1"],[0,"HPLWClosedPerSessionCount","1"],[0,"RATE_ITEM_MOB_MAIN","true"],[0,"TandemWeb.BlogPopupShown","true"],[0,"_x9f2e_20251112","true"],[0,"_x_popped","{}"],[0,"adViewed","true"],[0,"adblockDismissed","1"],[0,"ag-forced-auth-modal-displayed","true"],[0,"altses","false"],[0,"anixtv_bookmark_shown","true"],[0,"anonSessionNotific","1"],[0,"arena-bottom-drawer","true"],[0,"backCallPopupIsShown","1"],[0,"bannerClosed","true"],[0,"barcelona_mobile_upsell_state","1"],[0,"bellesa_show_slideout","false"],[0,"bonusIcon","false"],[0,"bookingSearchAlreadyOpened","true"],[0,"canShowSubscribe","2"],[0,"chillflix:community-prompt-session","1"],[0,"closeIntentModalShown","1"],[0,"cmsPopupShown","true"],[0,"coachmarkShown","true"],[0,"countPageSeen","$remove$"],[0,"discpopshown","true"],[0,"ecomsend_pp_already_show211873","true"],[0,"ecomsend_pp_already_show250959","true"],[0,"ecomsend_pp_window_normal211873","true"],[0,"elg_lp_seen_call","1"],[0,"embibeApp.smartBanner.landingHome","true"],[0,"enews_popup_session","1"],[0,"floating-sign-up-dismissed","true"],[0,"footer-notification","false"],[0,"freeshippingShown","1"],[0,"fs","1"],[0,"fs.adb6512.dis","1"],[0,"gaming-modal-shown","true"],[0,"guest-pro","true"],[0,"hasShowTouchLoginWall","true"],[0,"hasViewedReduceNotifications","true"],[0,"hidePopup","true"],[0,"isAvailableSmartBanner","false"],[0,"isOpenedLiveClassBanner","false"],[0,"kw_ad_clicks","2"],[0,"kw_ad_shown","5"],[0,"loggedOutCTAIsShown","1"],[0,"md_popup_clicks","null"],[0,"md_popup_shown","1"],[0,"modal-dismissed-mail-plus-intro-exit-intent","true"],[0,"modal-newsletter","false"],[0,"modalViewed","true"],[0,"newsletter-modal-seen","true"],[0,"omr-reviews-login-incentive-seen","1"],[0,"pharmaLeaveIntentPopup","true"],[0,"popup","1"],[0,"popup-closed","true"],[0,"pro_promote_v2_shown","true"],[0,"realm.Oidc.3pc","$remove$"],[0,"regRequested","true"],[0,"sd_amon_clara_dismissed_v4","1"],[0,"sfm-gofundmepro-closed","true"],[0,"shouldShowAuthBannerAfterQuery","false"],[0,"showBottomBanner","false"],[0,"showEventsBanner","false"],[0,"signUpBannerDismissed","true"],[0,"socialProofDisabled","1"],[0,"sr_s","1"],[0,"sw-notification-modal-swag-custom-notifications-newsletter-popup","1"],[0,"tam_newsletter_offer_seen","1"],[0,"telegram_popup_v1","true"],[0,"umggr-newsletter-first-load","true"],[0,"welcomeModalClosed","true"]],"v":{"1024teradl.com":[2],"1mg.com":[56],"adidas.ua":[21],"ag.mos.ru":[10],"anixtv.in":[12],"anixtv.pro":[12],"anixtv.us.cc":[12],"anixx.fun":[12],"baltbet.ru":[61],"baseball-reference.com":[69],"bcliquorstores.com":[33],"beeline.ru":[15],"bellesa.co":[18],"bleachernation.com":[38],"brawlify.com":[1],"bsky.app":[74],"chillflix.lol":[22],"discordservers.com":[35],"docsity.com":[23],"dramaflix.cc":[72],"dream.ai":[42],"elgroup-market.ru":[31],"embibe.com":[32,44,45],"eminem.com":[73],"eneba.com":[68],"expressnews.com":[60],"fantasyfootballhub.co.uk":[53],"feber.se":[37],"flipkart.com":[3],"footmercato.net":[26],"getstronganimals.com":[36],"grupoahora.net.br":[57],"hetzner.com":[59],"ibena.shop":[70],"ifixit.com":[54],"imdb.com":[25],"instagram.com":[48],"internxt.com":[65],"kawaii-anime.com":[46,47],"macpaw.com":[39],"makemytrip.com":[11],"mallofistanbul.com.tr":[24],"maltadaily.mt":[49,50],"maxicours.com":[58],"moneycontrol.com":[8],"myjewishlearning.com":[63],"neoxsoftworks.eu":[9],"njavtv.com":[7],"northcasino.com":[13],"novapost.com":[16],"oddsportal.com":[19],"omr.com":[55],"ozon.ru":[4],"perplexity.ai":[64,67],"powder.com":[14],"proton.me":[51],"qwertee.com":[43],"ringover.com":[66],"sd-partei.de":[62],"selenagomez.com":[73],"semafor.com":[34],"sfchronicle.com":[60],"shop.deeper.network":[29],"spencerdevs.xyz":[27],"streamscharts.com":[40],"tandem.net":[5],"th.gl":[6],"threads.com":[17],"titan-army.com":[28,30],"tjock.se":[37],"trukszyn.pl":[71],"upbeatcode.com":[0],"wizzair.com":[20],"www.kinopoisk.ru":[41],"zonealarm.com":[52]},"u":{}};
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
