// AdRaze-stubbe för PopAds: popunder-skriptet avbryts när det försöker sätta sina globaler
(function () {
  "use strict";
  var text = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
  window.addEventListener("error", function (e) { if (String(e.message).indexOf(text) !== -1) e.preventDefault(); }, true);
  var kasta = function () { throw new ReferenceError(text); };
  try { delete window.PopAds; delete window.popns; } catch (e) {}
  try { Object.defineProperties(window, { PopAds: { set: kasta }, popns: { set: kasta } }); } catch (e) {}
})();
