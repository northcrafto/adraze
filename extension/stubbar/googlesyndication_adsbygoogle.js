// AdRaze-stubbe för adsbygoogle.js: sidans annonskö tas emot men inget laddas. Små tomma ramar läggs
// i annonsplatserna så att sidor som letar efter dem inte tror att något blockerats.
(function () {
  "use strict";
  var w = window;
  w.adsbygoogle = { loaded: true, push: function () {} };
  var ramar = function () {
    var platser = document.querySelectorAll(".adsbygoogle");
    var stil = "height:1px!important;max-height:1px!important;max-width:1px!important;width:1px!important;";
    for (var i = 0; i < platser.length; i++) {
      var id = "aswift_" + i;
      if (document.getElementById(id)) continue;
      var ram = document.createElement("iframe");
      ram.id = id;
      ram.style.cssText = stil;
      var inre = document.createElement("iframe");
      inre.id = "google_ads_frame" + i;
      ram.appendChild(inre);
      platser[i].appendChild(ram);
    }
  };
  if (!document.querySelector(".adsbygoogle") && document.readyState === "loading") {
    w.addEventListener("DOMContentLoaded", ramar, { once: true });
  } else ramar();
})();
