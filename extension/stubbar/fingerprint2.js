// AdRaze-stubbe för fingerprintjs2: ett slumpat id per sidvisning i stället för ett fingeravtryck
(function () {
  "use strict";
  var id = "";
  for (var i = 0; i < 8; i++) id += ((Math.random() * 0x10000 + 0x1000) | 0).toString(16).slice(-4);
  var Fp = function () {};
  Fp.get = function (opts, cb) {
    if (!cb) cb = opts;
    if (typeof cb === "function") setTimeout(function () { cb(id, []); }, 1);
  };
  Fp.getPromise = function () { return Promise.resolve([]); };
  Fp.getV18 = Fp.get;
  Fp.x64hash128 = function () { return id; };
  Fp.prototype = { get: Fp.get };
  window.Fingerprint2 = Fp;
})();
