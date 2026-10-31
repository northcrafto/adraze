// AdRaze-stubbe för FuckAdBlock/BlockAdBlock/SniffAdBlock: detektorn svarar alltid "ingen blockerare"
(function () {
  "use strict";
  var noop = function () {};
  var Fab = function () {};
  Fab.prototype.check = noop;
  Fab.prototype.clearEvent = noop;
  Fab.prototype.emitEvent = noop;
  Fab.prototype.on = function (a, b) { if (!a) b(); return this; };
  Fab.prototype.onDetected = function () { return this; };
  Fab.prototype.onNotDetected = function (a) { a(); return this; };
  Fab.prototype.setOption = noop;
  Fab.prototype.options = { set: noop, get: noop };
  var fab = new Fab();
  var satt = function (namn, v) {
    try {
      if (Object.prototype.hasOwnProperty.call(window, namn)) window[namn] = v;
      else Object.defineProperty(window, namn, { get: function () { return v; }, set: noop });
    } catch (e) {}
  };
  ["FuckAdBlock", "BlockAdBlock", "SniffAdBlock"].forEach(function (n) { satt(n, Fab); });
  ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"].forEach(function (n) { satt(n, fab); });
})();
