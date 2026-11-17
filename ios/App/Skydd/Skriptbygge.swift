import Foundation
import WebKit

/// En del av skyddets innehållsskript och i vilken värld den körs. Alla körs vid dokumentets start i alla ramar.
struct Skriptdel: Sendable, Hashable {
    enum Varld: Sendable, Hashable { case sida, isolerad }

    let kalla: String
    let varld: Varld

    /// Första raden i alla skyddets skript, så att skyddet känner igen sina egna i `userContentController`
    /// (andra modulers skript lämnas kvar när skyddet byter sina).
    static let marke = "/*adraze-skydd*/\n"
    /// Världen för kosmetiken och kakrutorna (tilläggets "isolated world").
    static let isoleradVarld = "adraze-skydd"

    init(_ kod: String, _ varld: Varld) {
        kalla = Self.marke + kod
        self.varld = varld
    }

    @MainActor
    func skript() -> WKUserScript {
        WKUserScript(source: kalla, injectionTime: .atDocumentStart, forMainFrameOnly: false,
                     in: varld == .sida ? WKContentWorld.page : WKContentWorld.world(name: Self.isoleradVarld))
    }
}

/// Bygger innehållsskripten för en huvudsida, som tilläggets innehållsskript:
///
/// | Skript | Värld | Tillägget |
/// |---|---|---|
/// | Räknarens del: misslyckade fetch, XHR, beacon och fristående element (`Raknare.sidskript`) | sidans | – |
/// | Vakten (popunders, osynliga helsideslänkar) | sidans | `content/guard.js` |
/// | Scriptlets för sajten | sidans | `scriptlets/*.js` per värd |
/// | YouTube (spola förbi reklam) | sidans | `content/youtube.js` |
/// | Spårningsparametrar i fetch och XMLHttpRequest | sidans | DNR `removeParams` (xmlhttprequest) |
/// | Sajtens kosmetik, egna dölj-regler, kakrutornas CSS | isolerad | `cssFor` och `kakCssFor` i background.js |
/// | Kakrutor (klicka nej) | isolerad | `content/kakor.js` |
///
/// Sajtdatan byggs för toppsidans värd och dess överordnade domäner. I en ram från en annan sajt gäller bara
/// det som passar ramens egen värd (som i tillägget, men ramens egen sajtdata finns inte med).
///
/// Ägare: Skydd.
@MainActor
enum Skriptbygge {
    static func delar(for vard: String, data: Regeldata, element: JSONVarde, egna: String) -> [Skriptdel] {
        let nivaer = Vard.nivaer(vard)
        var poster: [String: [String: Any]] = [:]
        for n in nivaer {
            if let p = data.sajtpost(n) { poster[n] = p }
        }
        var ut: [Skriptdel] = []
        // Räknarens del i sidans värld (-raknareSida 0 stänger av den, för att mäta skillnaden)
        if AppMiljo.delad?.startargument.tal("raknareSida") != 0 { ut.append(Skriptdel(Raknare.sidskript, .sida)) }
        if !data.vakt.isEmpty { ut.append(Skriptdel(data.vakt, .sida)) }
        ut += scriptlets(poster, data: data)
        if !data.youtube.isEmpty {
            ut.append(Skriptdel("if (/(^|\\.)(youtube\\.com|youtube-nocookie\\.com)$/i.test(location.hostname)) {\n"
                                + data.youtube + "\n}", .sida))
        }
        let par = data.parameterreglerForSkript(vard: vard)
        if !par.isEmpty { ut.append(Skriptdel(parametrar.replacingOccurrences(of: "__R__", with: json(par)), .sida)) }
        if let css = cssSkript(poster, nivaer: nivaer, data: data, element: element, egna: egna) { ut.append(Skriptdel(css, .isolerad)) }
        if !data.kakor.isEmpty {
            ut.append(Skriptdel(kakorShim.replacingOccurrences(of: "__DOLJ__", with: json(data.kakDolj))
                .replacingOccurrences(of: "__KAKOR__", with: data.kakor), .isolerad))
        }
        return ut
    }

    // MARK: - Scriptlets

    /// En scriptlet per sort som har regler för sajten. Mallen från tillägget får en egen `D` med bara sajtens
    /// poster (`a` = anropen, `v` = nivå -> anrop, `u` = nivå -> undantag, -1 = alla av).
    static func scriptlets(_ poster: [String: [String: Any]], data: Regeldata) -> [Skriptdel] {
        struct Bygge { var a: [String] = []; var index: [String: Int] = [:]; var v: [String: [Int]] = [:]; var u: [String: [Int]] = [:] }
        var per: [Int: Bygge] = [:]
        for (nyckel, post) in poster {
            guard let s = post["s"] as? [String: Any] else { continue }
            for (itext, e) in s {
                guard let i = Int(itext), let e = e as? [String: Any] else { continue }
                var b = per[i] ?? Bygge()
                func plats(_ x: Any) -> Int {
                    let j = json(x)
                    if let n = b.index[j] { return n }
                    b.a.append(j)
                    b.index[j] = b.a.count - 1
                    return b.a.count - 1
                }
                for x in (e["v"] as? [Any]) ?? [] { b.v[nyckel, default: []].append(plats(x)) }
                for x in (e["u"] as? [Any]) ?? [] {
                    if let n = x as? Int, n == -1 { b.u[nyckel, default: []].append(-1) } else { b.u[nyckel, default: []].append(plats(x)) }
                }
                per[i] = b
            }
        }
        var ut: [Skriptdel] = []
        for i in per.keys.sorted() {
            guard i < data.scriptletMallar.count, !data.scriptletMallar[i].isEmpty, let b = per[i] else { continue }
            let d = "{\"a\":[" + b.a.joined(separator: ",") + "],\"v\":" + json(b.v) + ",\"u\":" + json(b.u) + "}"
            ut.append(Skriptdel(data.scriptletMallar[i].replacingOccurrences(of: "__ADRAZE_D__", with: d), .sida))
        }
        return ut
    }

    // MARK: - Kosmetik

    static func cssSkript(_ poster: [String: [String: Any]], nivaer: [String], data: Regeldata, element: JSONVarde, egna: String) -> String? {
        var n: [String: Any] = [:]
        for niva in nivaer {
            var o: [String: Any] = [:]
            if let p = poster[niva] {
                for f in ["c", "cx", "cs", "k", "kx", "ks"] { if let v = p[f] { o[f] = v } }
            }
            if let e = element[niva].lista?.compactMap(\.text), !e.isEmpty { o["e"] = e }
            if !o.isEmpty { n[niva] = o }
        }
        let egnaRegler = egnaKosmetik(egna)
        let d: [String: Any] = ["n": n, "egna": egnaRegler, "kakor": true, "upplas": data.kakUpplas]
        return css.replacingOccurrences(of: "__D__", with: json(d))
    }

    /// Datorns "Egna filter": raderna `domän,domän##selektor` och `##selektor` (inte `##+js`), som `egnaKosmetik`
    /// i browser/blockinst.js. Gäller i ramar vars värd passar (en tom domänlista gäller alla sajter).
    static func egnaKosmetik(_ text: String) -> [[Any]] {
        var ut: [[Any]] = []
        for rad in text.split(whereSeparator: \.isNewline) {
            let r = rad.trimmingCharacters(in: .whitespaces)
            guard !r.isEmpty, !r.hasPrefix("!"), let i = r.range(of: "##"), !r[i.upperBound...].hasPrefix("+js") else { continue }
            let sel = r[i.upperBound...].trimmingCharacters(in: .whitespaces)
            guard !sel.isEmpty else { continue }
            let dom = r[..<i.lowerBound].split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
            ut.append([dom, sel])
        }
        return ut
    }

    // MARK: - Hjälp

    static func json(_ v: Any) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed, .withoutEscapingSlashes]) else { return "null" }
        return String(decoding: d, as: UTF8.self)
    }

    // MARK: - Skripten

    /// Sajtens CSS i en egen `<style>`: specifika dölj-regler, :style-regler, blockerade element, egna filter och
    /// kakrutornas regler. Ogiltiga selektorer sorteras bort (en ogiltig fäller annars hela gruppen om 100).
    /// De generiska reglerna ligger i regellistorna "kosmetik" och "kakor" (WebKits egen stilmall).
    static let css = #"""
    (() => {
      const D = __D__;
      let h = location.hostname;
      if (!h) { try { h = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : ""; } catch (e) { h = ""; } }
      h = String(h).toLowerCase().replace(/\.$/, "");
      if (!h) return;
      const passar = (k) => h === k || h.endsWith("." + k);
      const niv = Object.keys(D.n).filter(passar);
      const giltig = (s) => { try { document.querySelector(s); return true; } catch (e) { return false; } };
      const dolj = (lista) => {
        const ok = lista.filter(giltig);
        let css = "";
        for (let i = 0; i < ok.length; i += 100) css += ok.slice(i, i + 100).join(",\n") + "{display:none!important}\n";
        return css;
      };
      const del = (c, x, s) => {
        const undantag = new Set();
        for (const k of niv) for (const v of D.n[k][x] || []) undantag.add(v);
        const spec = [];
        for (const k of niv) for (const v of D.n[k][c] || []) if (!undantag.has(v)) spec.push(v);
        let css = dolj(spec);
        for (const k of niv) for (const st of D.n[k][s] || []) {
          if (!undantag.has(st[0] + ":style(" + st[1] + ")") && giltig(st[0])) css += st[0] + "{" + st[1] + "}\n";
        }
        return css;
      };
      const egna = [];
      for (const k of niv) for (const v of D.n[k].e || []) egna.push(v);
      for (const r of D.egna) if (!r[0].length || r[0].some((d) => d[0] !== "~" && passar(d))) egna.push(r[1]);
      let css = del("c", "cx", "cs") + dolj(egna);
      if (D.kakor) css += del("k", "kx", "ks") + D.upplas;
      if (!css) return;
      const stil = document.createElement("style");
      stil.textContent = css;
      const satt = () => { const r = document.documentElement; if (r && !stil.isConnected) r.appendChild(stil); return !!r; };
      const vakta = () => new MutationObserver(satt).observe(document.documentElement, { childList: true });
      if (satt()) vakta();
      else new MutationObserver((m, o) => { if (satt()) { o.disconnect(); vakta(); } }).observe(document, { childList: true });
    })();
    """#

    /// Tilläggets `content/kakor.js` med en egen `chrome.runtime.sendMessage`: "kakor" svarar på när dokumentet
    /// har en rot, "kak-dolj" lägger rutans dölj-CSS i ramen, "kaka-avvisad" räknas inte (än).
    static let kakorShim = #"""
    (() => {
      const DOLJ = __DOLJ__;
      const rot = () => new Promise((klar) => {
        if (document.documentElement) { klar(); return; }
        const o = new MutationObserver(() => { if (document.documentElement) { o.disconnect(); klar(); } });
        o.observe(document, { childList: true });
      });
      const chrome = { runtime: { sendMessage(m) {
        if (m && m.typ === "kakor") return rot().then(() => ({ pa: true }));
        if (m && m.typ === "kak-dolj" && DOLJ[m.cmp]) {
          try {
            const s = document.createElement("style");
            s.textContent = DOLJ[m.cmp];
            (document.head || document.documentElement).appendChild(s);
          } catch (e) {}
        }
        return Promise.resolve(true);
      } } };
    __KAKOR__
    })();
    """#

    /// Spårningsparametrar i fetch och XMLHttpRequest (tilläggets DNR-regler med `xmlhttprequest`). Funktionerna
    /// byts mot en Proxy, så att `toString()` fortfarande säger "[native code]".
    static let parametrar = #"""
    (() => {
      const R = __R__;
      const h = String(location.hostname || "").toLowerCase();
      if (!h) return;
      const passar = (v, l) => l.some((d) => v === d || v.endsWith("." + d));
      const sajt = (x) => {
        const d = String(x).toLowerCase().replace(/^www\./, "").split(".");
        const tre = d.length > 2 && d[d.length - 1].length === 2 && /^(co|com|org|net|gov|ac|edu|or|ne|go)$/.test(d[d.length - 2]);
        return d.slice(tre ? -3 : -2).join(".");
      };
      const regler = R.filter((r) => (!r.init || passar(h, r.init)) && !(r.uninit && passar(h, r.uninit)))
        .map((r) => ({ r, rx: r.re.map((s) => new RegExp(s, r.skiftlage ? "" : "i")) }));
      if (!regler.length) return;
      const rensa = (u) => {
        let url;
        try { url = new URL(String(u), location.href); } catch (e) { return u; }
        if (!url.search) return u;
        let basta = null;
        for (const x of regler) {
          if (!x.rx.some((rx) => rx.test(url.href))) continue;
          if (x.r.tredje !== undefined && x.r.tredje !== (sajt(url.hostname) !== sajt(h))) continue;
          if (!basta || x.r.prio > basta.prio) basta = x.r;
        }
        if (!basta) return u;
        const delar = url.search.slice(1).split("&");
        const kvar = delar.filter((d) => {
          const n = d.split("=")[0];
          let a = n;
          try { a = decodeURIComponent(n); } catch (e) {}
          return !basta.bort.includes(a);
        });
        if (kvar.length === delar.length) return u;
        url.search = kvar.length ? "?" + kvar.join("&") : "";
        return url.href;
      };
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = new Proxy(open, { apply(t, self, a) {
        try { if (a.length > 1) a[1] = rensa(a[1]); } catch (e) {}
        return Reflect.apply(t, self, a);
      } });
      const f = window.fetch;
      if (typeof f === "function") window.fetch = new Proxy(f, { apply(t, self, a) {
        try {
          if (typeof a[0] === "string" || a[0] instanceof URL) a[0] = rensa(a[0]);
          else if (a[0] instanceof Request) { const n = rensa(a[0].url); if (n !== a[0].url) a[0] = new Request(n, a[0]); }
        } catch (e) {}
        return Reflect.apply(t, self, a);
      } });
    })();
    """#
}
