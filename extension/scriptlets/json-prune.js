// AdRaze-scriptlet json-prune: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"*","*.adserverDomain"],[0,"*","all"],[0,"*","pop_type"],[0,"*","rot_url"],[0,"*.blockId"],[0,"*.tanya_video_ads"],[0,"AffiliateAdBlock"],[0,"Blocks"],[0,"MediaContainer.Metadata.[].Ad"],[0,"PlaybackDetails.[].DaiVod"],[0,"RT-1562-AdShield-script-on-Huffpost"],[0,"[].data.TopAdsProducts.data.[-].__typename"],[0,"[].data.displayAdsV3.data.[-].__typename"],[0,"[].data.searchResults.listings.[-].targetingSegments"],[0,"[].data.topads.data.[-].__typename"],[0,"[].props.slides.[-].adIndex"],[0,"__SETTINGS__.siteSettings.ads_settings"],[0,"adReinsertion"],[0,"adRequest"],[0,"ad_pods.0.ads.0.segments.0.media ad_pods.1.ads.1.segments.1.media ad_pods.2.ads.2.segments.2.media ad_pods.3.ads.3.segments.3.media ad_pods.4.ads.4.segments.4.media ad_pods.5.ads.5.segments.5.media ad_pods.6.ads.6.segments.6.media ad_pods.7.ads.7.segments.7.media ad_pods.8.ads.8.segments.8.media"],[0,"ad_slots"],[0,"adblock popup vast"],[0,"adease adeaseBlob vmap","adease"],[0,"ads breaks cuepoints times"],[0,"ads playerAds"],[0,"ads"],[0,"ads.[-].ad_id"],[0,"ads.metadata ads.document ads.dxc ads.live ads.vod"],[0,"ads.servers.[].apiAddress"],[0,"adtagparameter","enabled"],[0,"adtech-brightline adtech-google-pal adtech-iab-om"],[0,"adverts.breaks"],[0,"autoRecovery"],[0,"autoplay"],[0,"avails"],[0,"bannerad sidebar ti_sidebar"],[0,"boosted_gifs"],[0,"breaks custom_breaks_data pause_ads video_metadata.end_credits_time","breaks"],[0,"breaks custom_breaks_data pause_ads video_metadata.end_credits_time","pause_ads"],[0,"breaks custom_breaks_data pause_ads"],[0,"breaks interstitials info","interstitials"],[0,"config.globalInteractions.[].bsData"],[0,"context.adsIncluded"],[0,"cuepointPlaylist vodPlaybackUrls.result.playbackUrls.cuepoints vodPlaylistedPlaybackUrls.result.playbackUrls.pauseBehavior vodPlaylistedPlaybackUrls.result.playbackUrls.pauseAdsResolution vodPlaylistedPlaybackUrls.result.playbackUrls.intraTitlePlaylist.[-].shouldShowOnScrubBar ads"],[0,"cuepoints","cuepoints.[].start cuepoints.[].end cuepoints.[].start_float cuepoints.[].end_float"],[0,"data","data.availableProductCount"],[0,"data.[].relationships.advert data.[].relationships.vast"],[0,"data.[].vast_url"],[0,"data.attributes.ssaiInfo.forecastTimeline data.attributes.ssaiInfo.vendorAttributes.nonLinearAds data.attributes.ssaiInfo.vendorAttributes.videoView data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adMetadata data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adParameters data.attributes.ssaiInfo.vendorAttributes.breaks.[].timeOffset"],[0,"data.getDetailPageContent.linkCustomAdOffers.[-].title"],[0,"data.getFinalClickoutUrl data.sendSraBid"],[0,"data.getTaboolaAds.*"],[0,"data.me.personalizedFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.adRequestId"],[0,"data.me.rhrFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.sponsor"],[0,"data.meta.require_addon data.meta.require_captcha data.meta.require_notifications data.meta.require_og_ads data.meta.require_video data.meta.require_web data.meta.require_related_topics data.meta.require_custom_ad_step data.meta.og_ads_offers data.meta.addon_url data.displayAds data.linkCustomAdOffers"],[0,"data.pinotPausedPlaybackPage"],[0,"data.reg"],[0,"data.searchClassifiedFeed.searchResultView.0.searchResultItemsV2.edges.[-].node.item.content.creative.clickThroughEvent.adsTrackingMetadata.metadata.adRequestId"],[0,"data.xdt_injected_story_units.ad_media_items"],[0,"direct rtb seatbid"],[0,"enabled","force_disabled"],[0,"enabled","testhide"],[0,"entries.[-].command.reelWatchEndpoint.adClientParams.isAd"],[0,"features.ad02 features.adshield"],[0,"gifs.[-].cta.link"],[0,"html"],[0,"items.[-].potentialActions.0.object.impressionToken items.[-].hasPart.0.potentialActions.0.object.impressionToken"],[0,"messages.*.ads messages.*.renderedAdsHtml"],[0,"meta.advertise"],[0,"movie.advertising.ad_server playlist.movie.advertising.ad_server"],[0,"offers"],[0,"pauseAd"],[0,"payload.ads campaigns.*"],[0,"placements.processingFile"],[0,"playerResponse.adPlacements playerResponse.playerAds adPlacements playerAds"],[0,"playerResponse.adPlacements playerResponse.playerAds playerResponse.adSlots adPlacements playerAds adSlots important"],[0,"playlist.movie.advertising.ad_server"],[0,"plugins.adService"],[0,"plugins.dfp"],[0,"props.initialAds"],[0,"props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHeaderAdScripts props.pageProps.data.aotFooterWidgets"],[0,"props.sponsoredAlternative"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.marketplace_search.feed_units.edges.[-].node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].relay_rendering_strategy.view_model.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].rendering_strategy.view_model.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.marketplace_feed_stories.edges.[-].node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.sideFeedUnit.nodes.[].new_adverts.nodes.[-].sponsored_data"],[0,"response.ads"],[0,"result.ads"],[0,"result.adverts"],[0,"result.responses.[].response.result.cards.[-].data.offers"],[0,"results.[-].advertisement"],[0,"rtb direct"],[0,"session.showAds"],[0,"show_adverts"],[0,"sorts.[].recommendationList.[-].contentMetadata.EncryptedAdTrackingData"],[0,"sponsored_ads"],[0,"ssaiInfo"],[0,"ssai_manifest ad_manifest playback_info.ad_info qvt.playback_info.ad_info"],[0,"steamBanner clickAds clickAdsUa clickAdsRu pushNotification"],[0,"stream.insertion.adSession stream.insertion.points stream.insertion stream.sources.*.insertion pods.0.ads"],[0,"success.page.spaces.player.widget_wrappers.[].widget.data.intervention_data"],[0,"testadtags ad"],[0,"uesUrlFallback"],[0,"value.media.ad_breaks"],[0,"video.channel"],[0,"web_share_ads_adsterra_config wap_short_link_middle_page_ad wap_short_link_middle_page_show_time data.ads_cpm_info"]],"v":{"10.com.au":[44],"10play.com.au":[44],"5flix.top":[6],"alekuriren.se":[33],"alltforforaldrar.se":[33],"alternativeto.net":[81],"app.plex.tv":[8],"art19.com":[19],"arvikanyheter.se":[33],"asiaontop.com":[80],"auto.ru":[25],"automotorsport.se":[33],"autotrader.co.uk":[13],"babyhjalp.se":[33],"barometern.se":[33],"bitchute.com":[95],"blt.se":[33],"bt.se":[33],"cafe.se":[33],"championat.com":[7],"channel4.com":[31],"chatgpt.com":[67],"chip.de":[60],"colearn.id":[5],"corren.se":[33],"criticker.com":[35],"crunchyroll.com":[105],"dalslanningen.se":[33],"dazn.com":[9],"di.se":[33],"disneyplus.com":[27,101],"ekuriren.se":[33],"embedseek.xyz":[24],"eposten.se":[33],"eu-proxy.startpage.com":[74],"expressen.se":[33],"familjeliv.se":[33],"fansonlinehub.com":[107],"fantasysports.yahoo.com":[32],"filipstadstidning.se":[33],"focus.de":[60],"folkbladet.nu":[33,104],"folkbladet.se":[33],"forge.plebmasters.de":[92],"fox.com":[25],"foxsports.com":[25],"foxtel.com.au":[22],"fragbite.se":[33],"fryksdalsbygden.se":[33],"genshin-soku.com":[65],"go.discovery.com":[48],"golfing.se":[33],"goplay.ml":[3],"goplay.su":[3],"gumtree.com":[63],"hanime.xxx":[21],"hbomax.com":[30],"helagotland.se":[33],"hentaihaven.xxx":[1],"hotmediahub.com":[107],"hotstar.com":[102],"huffpost.com":[10],"hulu.com":[37,38,39],"husbilskompisar.se":[79],"ibnytt.se":[33],"idrottensaffarer.se":[33],"instagram.com":[58],"iprima.cz":[77],"justwatch.com":[50],"kicker.de":[60],"kingmagazine.se":[33],"kkuriren.se":[33],"klt.nu":[33],"kristianstadsbladet.se":[33],"kt-kuriren.se":[33],"kuriren.nu":[33],"lchfarkivet.se":[33],"linkvertise.com":[49,51,54],"listeamed.net":[6],"lokalti.se":[33],"lokaltidningen.nu":[104],"mail.yahoo.com":[91],"mariestadstidningen.se":[33],"matspar.se":[72],"mellanbygden.nu":[104],"miniminiplus.pl":[28],"mirror.co.uk":[15],"mitti.se":[33],"monhan-soku.com":[65],"mvt.se":[33],"myvideo.ge":[46],"nbc.com":[34],"netflix.com":[55,90],"nextdoor.com":[52,53,57],"nkp.se":[33],"nlt.se":[33],"nordsverige.se":[104],"norrahalland.se":[33],"norran.se":[33],"nsd.se":[33],"nsk.se":[33],"nt.se":[33],"nuosteraker.se":[33],"nuovo.vidplayer.live":[24],"nvp.se":[33],"nwt.se":[33],"nyheter24.se":[33],"olandsbladet.se":[33],"p2pplay.pro":[24],"pistona.xyz":[6],"play.discoveryplus.com":[98],"play.history.com":[56],"play.max.com":[30],"play.virginmediatelevision.ie":[34],"player.pop.co.uk":[88],"player.popfun.co.uk":[88],"player.stv.tv":[103],"playhop.com":[59],"plus.rtl.de":[17],"pop-player.com":[88],"praktisktbatagande.se":[33],"pricerunner.se":[16],"primevid.click":[24],"provinstidningen.se":[33],"pt.se":[33],"realtid.se":[33],"realty.yandex.ru":[93],"recept.se":[33],"redgifs.com":[36,64],"roblox.com":[96],"rpmstream.live":[24],"saffletidningen.se":[33],"sainsburys.co.uk":[26],"sbs.com.au":[23],"serially.it":[25],"skaraborgsbygden.se":[33],"skd.se":[33],"sla.se":[33],"smp.se":[33],"sn.se":[33],"spaziogames.it":[45],"speedrun.com":[94],"sports.yahoo.com":[32],"sportstiger.com":[89],"storage.googleapiscdn.com":[71],"stories.los40.com":[41],"storiesig.info":[100],"stream.googleapiscdn.com":[71],"streamcasthub.store":[24],"strengnastidning.se":[33],"strp2p.site":[24],"svenskgolf.se":[33],"sverigespringer.se":[33],"swisscows.com":[42,66],"sydostran.se":[33],"terabox.fun":[107],"teraearn.com":[107],"teralink.me":[107],"terashare.me":[107],"testsieger.de":[70],"thelocal.se":[33],"toggo.de":[18],"tokopedia.com":[11,12,14],"transtxxx.com":[106],"trelleborgsallehanda.se":[33],"turbopages.org":[4],"tv2.no":[61],"tvn.pl":[69],"tvn24.pl":[76],"unt.se":[33],"upscaler.stockphotos.com":[73],"ut.se":[33],"vasterastidning.se":[33],"vasterbottningen.se":[104],"vaxjobladet.se":[33],"vf.se":[33],"vidnest.fun":[2,3],"vidnest.io":[2,3],"vidnest.live":[2,3],"viivilla.se":[33],"vimmerbytidning.se":[33],"vix.com":[20,40,78],"vk.se":[104],"vlive.tv":[68],"volokit2.com":[0],"voodc.com":[0],"vt.se":[33],"vvvvid.it":[47],"watch.foodnetwork.com":[48],"watch.sling.com":[99],"web.facebook.com":[82,83,84,85,86,87],"winfuture.de":[29],"www.amazon.co.jp":[43],"www.amazon.co.uk":[43],"www.amazon.com":[43],"www.amazon.de":[43],"www.facebook.com":[82,83,84,85,86,87],"www.primevideo.com":[43],"xn--gckdevd5myivf.site":[65],"xn--o9j0bk1l6d1bnv1as45bb2j.com":[65],"xprivo.com":[97],"yamiisoku.com":[65],"youtubekids.com":[62,75],"ystadsallehanda.se":[33]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;

  var F = [
    function jsonPrune(bort, nalar) {
        if (!bort) return;
        const vagar = bort.split(/ +/).filter(Boolean);
        const krav = nalar ? nalar.split(/ +/).filter(Boolean) : [];
        const hitta = (rot, vag, rensa) => {
          let agare = rot, k = vag;
          for (;;) {
            if (typeof agare !== "object" || agare === null) return false;
            const i = k.indexOf(".");
            if (i === -1) {
              if (!rensa) return Object.prototype.hasOwnProperty.call(agare, k);
              let andrat = false;
              if (k === "*") { for (const n of Object.keys(agare)) { delete agare[n]; andrat = true; } }
              else if (Object.prototype.hasOwnProperty.call(agare, k)) { delete agare[k]; andrat = true; }
              return andrat;
            }
            const prop = k.slice(0, i), nasta = k.slice(i + 1);
            let hittat = false;
            if (prop === "[-]" && Array.isArray(agare)) {
              for (let j = agare.length - 1; j >= 0; j--) if (hitta(agare[j], nasta, false)) { agare.splice(j, 1); hittat = true; }
              return hittat;
            }
            if (prop === "{-}" && agare instanceof Object) {
              for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, false)) { delete agare[n]; hittat = true; }
              return hittat;
            }
            if ((prop === "[]" && Array.isArray(agare)) || ((prop === "{}" || prop === "*") && agare instanceof Object)) {
              for (const n of Object.keys(agare)) if (hitta(agare[n], nasta, rensa)) hittat = true;
              return hittat;
            }
            if (!Object.prototype.hasOwnProperty.call(agare, prop)) return false;
            agare = agare[prop];
            k = nasta;
          }
        };
        JSON.parse = new Proxy(JSON.parse, {
          apply(f, detta, args) {
            const obj = Reflect.apply(f, detta, args);
            try { if (krav.every((n) => hitta(obj, n, false))) for (const v of vagar) hitta(obj, v, true); } catch (e) {}
            return obj;
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
