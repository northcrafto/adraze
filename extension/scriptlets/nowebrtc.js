// AdRaze-scriptlet nowebrtc: genererad av tools/build.js från filterlistornas ##+js-filter.
// Ändra inte här: källkoden finns i tools/scriptlets.js.
(function () {
  "use strict";
  var h = location.hostname;
  if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
  h = String(h).toLowerCase().replace(/\.$/, "");
  if (!h) return;
  var D = {"a":[[0]],"v":{"1337x.ninjaproxy1.com":[0],"1fichier.com":[0],"aii.sh":[0],"animeid.tv":[0],"blizzboygames.net":[0],"bonstreams.net":[0],"buffstreamz.com":[0],"coinfaucet.io":[0],"convertinmp4.com":[0],"cpmlink.net":[0],"ddlvalley.me":[0],"eroticmoviesonline.me":[0],"ex-foary.com":[0],"f1livegp.net":[0],"fluvore.com":[0],"freecardano.com":[0],"freenem.com":[0],"gtaall.com":[0],"iulive.blogspot.com":[0],"kinoger.to":[0],"mimaletamusical.blogspot.com":[0],"modsbase.com":[0],"oceanoffgames.com":[0],"onhockey.tv":[0],"peliculasmx.net":[0],"planetfools.com":[0],"short.pe":[0],"shrink.icu":[0],"skidrowcrack.com":[0],"sms-anonyme.net":[0],"software-on.com":[0],"srt.am":[0],"startseite.to":[0],"uii.io":[0],"uptobox.com":[0],"web.livecricket.is":[0],"wizhdsports.fi":[0],"xrivonet.info":[0],"zimabdko.com":[0]},"u":{}};
  var att = [], inte = {}, delar = h.split(".");
  for (var i = 0; i < delar.length; i++) {
    var k = delar.slice(i).join("."), x = D.v[k], y = D.u[k], j;
    if (x) for (j = 0; j < x.length; j++) att.push(x[j]);
    if (y) for (j = 0; j < y.length; j++) inte[y[j]] = true;
  }
  if (!att.length || inte[-1]) return;

  var F = [
    function nowebrtc() {
        const namn = window.RTCPeerConnection ? "RTCPeerConnection" : window.webkitRTCPeerConnection ? "webkitRTCPeerConnection" : "";
        if (!namn) return;
        const noop = function () {};
        const Falsk = function () {};
        Falsk.prototype = { close: noop, createDataChannel: noop, createOffer: noop, setRemoteDescription: noop, toString() { return "[object RTCPeerConnection]"; } };
        const orig = window[namn];
        window[namn] = Falsk.bind(window);
        if (orig && orig.prototype) {
          try { orig.prototype.createDataChannel = function () { return { close() {}, send() {} }; }.bind(null); } catch (e) {}
        }
      }
  ];
  att.sort(function (a, b) { return a - b; });
  for (var n = 0; n < att.length; n++) {
    if (inte[att[n]] || (n && att[n] === att[n - 1])) continue;
    var p = D.a[att[n]];
    try { F[p[0]].apply(null, p.slice(1)); } catch (e) {}
  }
})();
