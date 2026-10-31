// AdRaze-stubbe för Amazons apstag.js: budförfrågningar svarar direkt med inga bud
(function () {
  "use strict";
  var noop = function () {};
  var w = window;
  var ko = (w.apstag && w.apstag._Q) || [];
  var apstag = {
    _Q: ko,
    fetchBids: function (cfg, cb) { if (typeof cb === "function") { try { cb([]); } catch (e) {} } },
    init: noop, setDisplayBids: noop, targetingKeys: function () { return []; }, renderImp: noop,
    dpa: noop, rpa: noop, upa: noop,
  };
  w.apstag = apstag;
  var kor = function (typ, args) { if (typ === "f" && args) { try { apstag.fetchBids.apply(null, args); } catch (e) {} } };
  for (var i = 0; i < ko.length; i++) { if (ko[i] && ko[i].length) kor(ko[i][0], ko[i][1]); }
  try { ko.push = function (typ, args) { kor(typ, args); return 0; }; } catch (e) {}
})();
