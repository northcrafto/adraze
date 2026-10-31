// AdRaze-stubbe för Google Publisher Tag (gpt.js): samma API som tomma metoder, så att sidan inte
// fastnar i väntan på annonsbiblioteket. Köade googletag.cmd-anrop körs direkt.
(function () {
  "use strict";
  var noop = function () {};
  var w = window;
  function Plats() {}
  var p = Plats.prototype;
  var detta = function () { return this; };
  p.addService = detta; p.clearCategoryExclusions = detta; p.clearTargeting = detta; p.defineSizeMapping = detta;
  p.set = detta; p.setCategoryExclusion = detta; p.setClickUrl = detta; p.setCollapseEmptyDiv = detta;
  p.setForceSafeFrame = detta; p.setSafeFrameConfig = detta; p.setTargeting = detta; p.updateTargetingFromMap = detta;
  p.setConfig = detta;
  p.get = function () { return null; };
  p.getAdUnitPath = function () { return ""; };
  p.getAttributeKeys = function () { return []; };
  p.getCategoryExclusions = function () { return []; };
  p.getDomId = function () { return ""; };
  p.getSlotElementId = function () { return ""; };
  p.getSlotId = function () { return this; };
  p.getSizes = function () { return []; };
  p.getTargeting = function () { return []; };
  p.getTargetingKeys = function () { return []; };
  p.getResponseInformation = function () { return null; };
  var tjanst = function () {
    var t = {};
    var ja = function () { return t; };
    ["addEventListener", "removeEventListener", "clear", "clearCategoryExclusions", "clearTagForChildDirectedTreatment",
      "clearTargeting", "collapseEmptyDivs", "defineOutOfPagePassback", "definePassback", "disableInitialLoad",
      "display", "enableAsyncRendering", "enableLazyLoad", "enableSingleRequest", "enableSyncRendering",
      "enableVideoAds", "refresh", "set", "setCategoryExclusion", "setCentering", "setCookieOptions",
      "setForceSafeFrame", "setLocation", "setPrivacySettings", "setPublisherProvidedId", "setRequestNonPersonalizedAds",
      "setSafeFrameConfig", "setTagForChildDirectedTreatment", "setTargeting", "setVideoContent", "updateCorrelator",
      "setConfig", "setAdIframeTitle", "setContent"].forEach(function (n) { t[n] = ja; });
    t.get = function () { return null; };
    t.getAttributeKeys = function () { return []; };
    t.getSlots = function () { return []; };
    t.getTargeting = function () { return []; };
    t.getTargetingKeys = function () { return []; };
    t.getSlotIdMap = function () { return {}; };
    t.isInitialLoadDisabled = function () { return true; };
    return t;
  };
  var pubads = tjanst(), companion = tjanst(), innehall = tjanst();
  var kor = function () {
    for (var i = 0; i < arguments.length; i++) { try { if (typeof arguments[i] === "function") arguments[i](); } catch (e) {} }
    return 1;
  };
  var gt = {
    apiReady: true, pubadsReady: true, cmd: { push: kor },
    defineOutOfPageSlot: function () { return new Plats(); },
    defineSlot: function () { return new Plats(); },
    destroySlots: function () { return true; },
    disablePublisherConsole: noop, display: noop, enableServices: noop, getVersion: function () { return "0"; },
    onPubAdsApiLoad: noop, openConsole: noop, setAdIframeTitle: noop, setConfig: noop,
    pubads: function () { return pubads; },
    companionAds: function () { return companion; },
    content: function () { return innehall; },
    sizeMapping: function () { var b = { addSize: function () { return b; }, build: function () { return []; } }; return b; },
  };
  gt.enums = { OutOfPageFormat: { REWARDED: 4, TOP_ANCHOR: 2, BOTTOM_ANCHOR: 3, INTERSTITIAL: 5 } };
  var fore = w.googletag;
  w.googletag = gt;
  if (fore && fore.cmd && typeof fore.cmd.length === "number") {
    for (var i = 0; i < fore.cmd.length; i++) kor(fore.cmd[i]);
  }
})();
