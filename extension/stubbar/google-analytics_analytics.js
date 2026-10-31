// AdRaze-stubbe för Google Analytics (analytics.js) och Tag Manager (gtm.js): inget skickas, men
// sidor som väntar på ett svar (hitCallback, eventCallback, "anti-flimmer"-döljningen) får det direkt.
(function () {
  "use strict";
  var noop = function () {};
  var w = window;
  function Sparare() {}
  Sparare.prototype.get = noop;
  Sparare.prototype.set = noop;
  Sparare.prototype.send = noop;
  var namn = w.GoogleAnalyticsObject || "ga";
  var fore = w[namn];
  var ga = function () {
    var n = arguments.length;
    if (!n) return;
    var sista = arguments[n - 1];
    var cb = null;
    if (typeof sista === "function") cb = function () { sista(new Sparare()); };
    else if (sista instanceof Object && typeof sista.hitCallback === "function") cb = sista.hitCallback;
    else {
      var i = Array.prototype.indexOf.call(arguments, "hitCallback");
      if (i !== -1 && typeof arguments[i + 1] === "function") cb = arguments[i + 1];
    }
    if (cb) { try { cb(); } catch (e) {} }
  };
  ga.create = function () { return new Sparare(); };
  ga.getByName = function () { return new Sparare(); };
  ga.getAll = function () { return [new Sparare()]; };
  ga.remove = noop;
  ga.loaded = true;
  w[namn] = ga;
  if (fore && fore.q && typeof fore.q.length === "number") {
    for (var j = 0; j < fore.q.length; j++) { try { ga.apply(null, fore.q[j]); } catch (e) {} }
  }
  w.google_tag_manager = w.google_tag_manager || {};
  var dl = w.dataLayer;
  if (dl instanceof Object) {
    if (dl.hide instanceof Object && typeof dl.hide.end === "function") { try { dl.hide.end(); } catch (e) {} dl.hide.end = noop; }
    if (typeof dl.push === "function") {
      var svara = function (o) {
        if (!(o instanceof Object) || typeof o.eventCallback !== "function") return;
        setTimeout(o.eventCallback, 1);
        o.eventCallback = noop;
      };
      dl.push = new Proxy(dl.push, { apply: function (f, t, a) { svara(a[0]); return Reflect.apply(f, t, a); } });
      if (Array.isArray(dl)) { var kopia = dl.slice(); for (var k = 0; k < kopia.length; k++) svara(kopia[k]); }
    }
  }
})();
