// AdRaze-scriptlet json-prune: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0,"*","*.adserverDomain"],[0,"*","all"],[0,"*","pop_type"],[0,"*","rot_url"],[0,"*.blockId"],[0,"*.props.videoPlayerAds *.props.postButtonAds"],[0,"*.tanya_video_ads"],[0,"AffiliateAdBlock"],[0,"Blocks"],[0,"MediaContainer.Metadata.[].Ad"],[0,"PlaybackDetails.[].DaiVod"],[0,"RT-1562-AdShield-script-on-Huffpost"],[0,"[].data.TopAdsProducts.data.[-].__typename"],[0,"[].data.displayAdsV3.data.[-].__typename"],[0,"[].data.searchResults.listings.[-].targetingSegments"],[0,"[].data.topads.data.[-].__typename"],[0,"[].props.slides.[-].adIndex"],[0,"__SETTINGS__.siteSettings.ads_settings"],[0,"adReinsertion"],[0,"adRequest"],[0,"ad_pods.0.ads.0.segments.0.media ad_pods.1.ads.1.segments.1.media ad_pods.2.ads.2.segments.2.media ad_pods.3.ads.3.segments.3.media ad_pods.4.ads.4.segments.4.media ad_pods.5.ads.5.segments.5.media ad_pods.6.ads.6.segments.6.media ad_pods.7.ads.7.segments.7.media ad_pods.8.ads.8.segments.8.media"],[0,"ad_slots"],[0,"adblock popup vast"],[0,"adease adeaseBlob vmap","adease"],[0,"ads breaks cuepoints times"],[0,"ads playerAds"],[0,"ads"],[0,"ads.[-].ad_id"],[0,"ads.metadata ads.document ads.dxc ads.live ads.vod"],[0,"ads.servers.[].apiAddress"],[0,"adtagparameter","enabled"],[0,"adtech-brightline adtech-google-pal adtech-iab-om"],[0,"adverts.breaks"],[0,"autoRecovery"],[0,"autoplay"],[0,"avails"],[0,"bannerad sidebar ti_sidebar"],[0,"boosted_gifs"],[0,"breaks custom_breaks_data pause_ads video_metadata.end_credits_time","breaks"],[0,"breaks custom_breaks_data pause_ads video_metadata.end_credits_time","pause_ads"],[0,"breaks custom_breaks_data pause_ads"],[0,"breaks interstitials info","interstitials"],[0,"config.globalInteractions.[].bsData"],[0,"context.adsIncluded"],[0,"cuepointPlaylist vodPlaybackUrls.result.playbackUrls.cuepoints vodPlaylistedPlaybackUrls.result.playbackUrls.pauseBehavior vodPlaylistedPlaybackUrls.result.playbackUrls.pauseAdsResolution vodPlaylistedPlaybackUrls.result.playbackUrls.intraTitlePlaylist.[-].shouldShowOnScrubBar ads"],[0,"cuepoints","cuepoints.[].start cuepoints.[].end cuepoints.[].start_float cuepoints.[].end_float"],[0,"data","data.availableProductCount"],[0,"data.[].relationships.advert data.[].relationships.vast"],[0,"data.[].vast_url"],[0,"data.attributes.ssaiInfo.forecastTimeline data.attributes.ssaiInfo.vendorAttributes.nonLinearAds data.attributes.ssaiInfo.vendorAttributes.videoView data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adMetadata data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adParameters data.attributes.ssaiInfo.vendorAttributes.breaks.[].timeOffset"],[0,"data.getDetailPageContent.linkCustomAdOffers.[-].title"],[0,"data.getFinalClickoutUrl data.sendSraBid"],[0,"data.getTaboolaAds.*"],[0,"data.me.personalizedFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.adRequestId"],[0,"data.me.rhrFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.sponsor"],[0,"data.meta.require_addon data.meta.require_captcha data.meta.require_notifications data.meta.require_og_ads data.meta.require_video data.meta.require_web data.meta.require_related_topics data.meta.require_custom_ad_step data.meta.og_ads_offers data.meta.addon_url data.displayAds data.linkCustomAdOffers"],[0,"data.pinotPausedPlaybackPage"],[0,"data.reg"],[0,"data.searchClassifiedFeed.searchResultView.0.searchResultItemsV2.edges.[-].node.item.content.creative.clickThroughEvent.adsTrackingMetadata.metadata.adRequestId"],[0,"data.xdt_injected_story_units.ad_media_items"],[0,"direct rtb seatbid"],[0,"enabled","force_disabled"],[0,"enabled","testhide"],[0,"entries.[-].command.reelWatchEndpoint.adClientParams.isAd"],[0,"features.ad02 features.adshield"],[0,"gifs.[-].cta.link"],[0,"items.[-].potentialActions.0.object.impressionToken items.[-].hasPart.0.potentialActions.0.object.impressionToken"],[0,"messages.*.ads messages.*.renderedAdsHtml"],[0,"meta.advertise"],[0,"movie.advertising.ad_server playlist.movie.advertising.ad_server"],[0,"offers"],[0,"pauseAd"],[0,"payload.ads campaigns.*"],[0,"placements.processingFile"],[0,"playerResponse.adPlacements playerResponse.playerAds adPlacements playerAds"],[0,"playerResponse.adPlacements playerResponse.playerAds playerResponse.adSlots adPlacements playerAds adSlots important"],[0,"playlist.movie.advertising.ad_server"],[0,"plugins.adService"],[0,"plugins.dfp"],[0,"props.ads props.sideAd props.infoAd"],[0,"props.initialAds"],[0,"props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHeaderAdScripts props.pageProps.data.aotFooterWidgets"],[0,"props.sponsoredAlternative"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.marketplace_search.feed_units.edges.[-].node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].relay_rendering_strategy.view_model.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].rendering_strategy.view_model.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.marketplace_feed_stories.edges.[-].node.story.sponsored_data.ad_id"],[0,"require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.sideFeedUnit.nodes.[].new_adverts.nodes.[-].sponsored_data"],[0,"response.ads"],[0,"result.ads"],[0,"result.adverts"],[0,"result.responses.[].response.result.cards.[-].data.offers"],[0,"results.[-].advertisement"],[0,"rtb direct"],[0,"session.showAds"],[0,"show_adverts"],[0,"sorts.[].recommendationList.[-].contentMetadata.EncryptedAdTrackingData"],[0,"sponsored_ads"],[0,"ssaiInfo"],[0,"ssai_manifest ad_manifest playback_info.ad_info qvt.playback_info.ad_info"],[0,"steamBanner clickAds clickAdsUa clickAdsRu pushNotification"],[0,"stream.insertion.adSession stream.insertion.points stream.insertion stream.sources.*.insertion pods.0.ads"],[0,"success.page.spaces.player.widget_wrappers.[].widget.data.intervention_data"],[0,"testadtags ad"],[0,"uesUrlFallback"],[0,"value.media.ad_breaks"],[0,"video.channel"],[0,"web_share_ads_adsterra_config wap_short_link_middle_page_ad wap_short_link_middle_page_show_time data.ads_cpm_info"]],"v":{"10.com.au":[45],"10play.com.au":[45],"5flix.top":[7],"alekuriren.se":[34],"allpornflix.com":[5],"alltforforaldrar.se":[34],"alternativeto.net":[82],"app.plex.tv":[9],"art19.com":[20],"arvikanyheter.se":[34],"asiaontop.com":[81],"auto.ru":[26],"automotorsport.se":[34],"autotrader.co.uk":[14],"babyhjalp.se":[34],"barometern.se":[34],"bitchute.com":[96],"blt.se":[34],"bt.se":[34],"cafe.se":[34],"championat.com":[8],"channel4.com":[32],"chatgpt.com":[67],"chip.de":[61],"colearn.id":[6],"corren.se":[34],"criticker.com":[36],"crunchyroll.com":[106],"dalslanningen.se":[34],"dazn.com":[10],"di.se":[34],"disneyplus.com":[28,102],"ekuriren.se":[34],"embedseek.xyz":[25],"eposten.se":[34],"eu-proxy.startpage.com":[74],"expressen.se":[34],"familjeliv.se":[34],"fansonlinehub.com":[108],"fantasysports.yahoo.com":[33],"filipstadstidning.se":[34],"focus.de":[61],"folkbladet.nu":[34,105],"folkbladet.se":[34],"forge.plebmasters.de":[93],"fox.com":[26],"foxsports.com":[26],"foxtel.com.au":[23],"fragbite.se":[34],"fryksdalsbygden.se":[34],"go.discovery.com":[49],"golfing.se":[34],"goplay.ml":[3],"goplay.su":[3],"greekfun.net":[2,3],"gumtree.com":[64],"hanime.xxx":[22],"hbomax.com":[31],"helagotland.se":[34],"hentai2read.com":[79],"hentaihaven.xxx":[1],"hotmediahub.com":[108],"hotstar.com":[103],"huffpost.com":[11],"hulu.com":[38,39,40],"husbilskompisar.se":[80],"ibnytt.se":[34],"idrottensaffarer.se":[34],"instagram.com":[59],"iprima.cz":[77],"justwatch.com":[51],"kicker.de":[61],"kingmagazine.se":[34],"kkuriren.se":[34],"klt.nu":[34],"kristianstadsbladet.se":[34],"kt-kuriren.se":[34],"kuriren.nu":[34],"lchfarkivet.se":[34],"linkvertise.com":[50,52,55],"listeamed.net":[7],"lokalti.se":[34],"lokaltidningen.nu":[105],"mail.yahoo.com":[92],"mariestadstidningen.se":[34],"matspar.se":[72],"mellanbygden.nu":[105],"miniminiplus.pl":[29],"mirror.co.uk":[16],"mitti.se":[34],"mvt.se":[34],"myvideo.ge":[47],"nbc.com":[35],"netflix.com":[56,91],"nextdoor.com":[53,54,58],"nkp.se":[34],"nlt.se":[34],"nordsverige.se":[105],"norrahalland.se":[34],"norran.se":[34],"nsd.se":[34],"nsk.se":[34],"nt.se":[34],"nuosteraker.se":[34],"nuovo.vidplayer.live":[25],"nvp.se":[34],"nwt.se":[34],"nyheter24.se":[34],"olandsbladet.se":[34],"p2pplay.pro":[25],"pistona.xyz":[7],"play.discoveryplus.com":[99],"play.history.com":[57],"play.max.com":[31],"play.virginmediatelevision.ie":[35],"player.pop.co.uk":[89],"player.popfun.co.uk":[89],"player.stv.tv":[104],"playhop.com":[60],"plus.rtl.de":[18],"pop-player.com":[89],"praktisktbatagande.se":[34],"pricerunner.se":[17],"primevid.click":[25],"provinstidningen.se":[34],"pt.se":[34],"realtid.se":[34],"realty.yandex.ru":[94],"recept.se":[34],"redgifs.com":[37,65],"roblox.com":[97],"rpmstream.live":[25],"saffletidningen.se":[34],"sainsburys.co.uk":[27],"sbs.com.au":[24],"serially.it":[26],"skaraborgsbygden.se":[34],"skd.se":[34],"sla.se":[34],"smp.se":[34],"sn.se":[34],"spaziogames.it":[46],"speedrun.com":[95],"sports.yahoo.com":[33],"sportstiger.com":[90],"storage.googleapiscdn.com":[71],"stories.los40.com":[42],"storiesig.info":[101],"stream.googleapiscdn.com":[71],"streamcasthub.store":[25],"strengnastidning.se":[34],"strp2p.site":[25],"svenskgolf.se":[34],"sverigespringer.se":[34],"swisscows.com":[43,66],"sydostran.se":[34],"terabox.fun":[108],"teraearn.com":[108],"teralink.me":[108],"terashare.me":[108],"testsieger.de":[70],"thelocal.se":[34],"toggo.de":[19],"tokopedia.com":[12,13,15],"transtxxx.com":[107],"trelleborgsallehanda.se":[34],"turbopages.org":[4],"tv2.no":[62],"tvn.pl":[69],"tvn24.pl":[76],"unt.se":[34],"upscaler.stockphotos.com":[73],"ut.se":[34],"vasterastidning.se":[34],"vasterbottningen.se":[105],"vaxjobladet.se":[34],"vf.se":[34],"vidnest.fun":[2,3],"vidnest.io":[2,3],"vidnest.live":[2,3],"viivilla.se":[34],"vimmerbytidning.se":[34],"vix.com":[21,41,78],"vk.se":[105],"vlive.tv":[68],"volokit2.com":[0],"voodc.com":[0],"vt.se":[34],"vvvvid.it":[48],"watch.foodnetwork.com":[49],"watch.sling.com":[100],"web.facebook.com":[83,84,85,86,87,88],"winfuture.de":[30],"www.amazon.co.jp":[44],"www.amazon.co.uk":[44],"www.amazon.com":[44],"www.amazon.de":[44],"www.facebook.com":[83,84,85,86,87,88],"www.primevideo.com":[44],"xprivo.com":[98],"youtubekids.com":[63,75],"ystadsallehanda.se":[34]},"u":{}};
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
