import Foundation

/// Stoppsidan när skyddet stoppade en hel sida, i datorns `blocked.html`-utformning: gorillan, rubriken i
/// Fraunces, adressen och två knappar med orange vätskefyllning. Ljus eller mörk efter appens tema
/// (`prefers-color-scheme`), mörk som datorns. Sidan är helt fristående (typsnitt och bilder inbäddade), eftersom
/// Flikar laddar den med `baseURL: nil`. Knapparna är vanliga länkar till `https://adraze.invalid/…` som skyddet
/// fångar i `beslut(for:)`, så sidan fungerar även när JavaScript är avstängt.
///
/// Ägare: Skydd.
enum Stoppsida {
    enum Orsak { case farlig, annons }

    static func html(adress: URL, orsak: Orsak, tillbaka: URL, kanGaTillbaka: Bool, fortsatt: URL?) -> String {
        let text: String
        switch orsak {
        case .farlig:
            text = "Den här adressen finns på våra listor över reklam, popups och farliga sidor. Ofta är det en omdirigering som en annons försökte skicka dig till."
        case .annons:
            text = "En annons på sidan försökte skicka fliken vidare till den här adressen."
        }
        var knappar = "<a id=\"tillbaka\" class=\"knapp prim\" href=\"\(esc(tillbaka.absoluteString))\">\(kanGaTillbaka ? "Gå tillbaka" : "Stäng fliken")</a>"
        if let fortsatt {
            knappar += "\n<a id=\"fortsatt\" class=\"knapp sek\" href=\"\(esc(fortsatt.absoluteString))\">Fortsätt ändå</a>"
        }
        return """
        <!doctype html>
        <html lang="sv">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="color-scheme" content="light dark">
        <title>Stoppad av AdRaze</title>
        <style>
        \(Tillgangar.typsnitt)
        \(stil)
        </style>
        </head>
        <body>
        <main>
        <div class="marke"><img src="\(Tillgangar.gorilla)" alt="" width="40" height="40"><span>AdRaze</span></div>
        <div class="figur" aria-hidden="true">\(Tillgangar.figur)</div>
        <h1>AdRaze stoppade sidan</h1>
        <p>\(esc(text))</p>
        <code id="url">\(esc(adress.absoluteString))</code>
        <div class="knappar">
        \(knappar)
        </div>
        </main>
        <script>
        document.querySelectorAll("a.knapp").forEach(function (a) {
          a.addEventListener("click", function (e) {
            if (a.classList.contains("fyll")) return;
            e.preventDefault();
            a.classList.add("fyll");
            setTimeout(function () { location.href = a.href; }, 320);
          });
        });
        </script>
        </body>
        </html>
        """
    }

    static func esc(_ s: String) -> String {
        var ut = ""
        ut.reserveCapacity(s.count)
        for t in s {
            switch t {
            case "&": ut += "&amp;"
            case "<": ut += "&lt;"
            case ">": ut += "&gt;"
            case "\"": ut += "&quot;"
            case "'": ut += "&#39;"
            default: ut.append(t)
            }
        }
        return ut
    }

    /// Färgerna är datorns (blocked.css och sajtens style.css). Knapparna fylls med orange underifrån när man
    /// trycker (sajtens .liq), och länken följs när fyllningen syns.
    static let stil = """
    :root { --bg: #f2f2ef; --yta: #ffffff; --ink: #111113; --dov: #5c5c63; --linje: #dadad4; --accent: #ff4b1f;
      --fyll: #ff6a43; --knapp: #111113; --knapptext: #ffffff; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0c0c0e; --yta: #16161a; --ink: #f4f4f5; --dov: #8b8b94; --linje: #26262c; --knapp: #f4f4f5; --knapptext: #111113; }
      .figur [fill="#090814"] { fill: #e4e4e7; }
      .figur [fill="#3f3d56"] { fill: #a1a1aa; }
      .figur [fill="#e6e6e6"] { fill: #26262c; }
      .figur [fill="#ccc"] { fill: #3f3f46; }
    }
    * { box-sizing: border-box; margin: 0; }
    html { -webkit-text-size-adjust: 100%; background: var(--bg); }
    body { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; justify-content: center;
      padding: max(24px, env(safe-area-inset-top)) 22px max(28px, env(safe-area-inset-bottom));
      background: var(--bg); color: var(--ink); font: 17px/1.5 "Familjen Grotesk", -apple-system, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased; }
    main { width: 100%; max-width: 520px; margin: 0 auto; }
    .marke { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 19px; letter-spacing: -0.02em; }
    .marke img { width: 40px; height: 40px; display: block; }
    .figur { margin: 26px auto 4px; max-width: 330px; }
    .figur svg { display: block; width: 100%; height: auto; }
    h1 { font-family: "AdRaze Display", Georgia, serif; font-weight: 560; font-variation-settings: "opsz" 48;
      font-size: 34px; line-height: 1.05; letter-spacing: -0.025em; margin: 22px 0 12px; }
    p { color: var(--dov); }
    code { display: block; margin: 18px 0 24px; padding: 12px 14px; background: var(--yta); border: 1px solid var(--linje);
      border-radius: 12px; font: 14px/1.45 ui-monospace, Menlo, monospace; word-break: break-all; color: var(--ink); }
    .knappar { display: flex; flex-direction: column; gap: 10px; }
    .knapp { position: relative; overflow: hidden; isolation: isolate; display: block; text-align: center;
      padding: 15px 22px; border-radius: 999px; font-weight: 600; font-size: 17px; line-height: 1.2; text-decoration: none;
      -webkit-tap-highlight-color: transparent; transition: color .5s ease, box-shadow .4s ease, transform .2s ease; }
    .knapp::before { content: ""; position: absolute; z-index: -1; left: -15%; width: 130%; bottom: 0; height: 165%;
      transform: translateY(104%); background: linear-gradient(180deg, var(--fyll) 0%, var(--accent) 100%);
      border-radius: 46% 46% 0 0; transition: transform .75s cubic-bezier(.2,.75,.25,1); pointer-events: none; }
    .knapp:active::before, .knapp.fyll::before { transform: translateY(0); }
    .knapp:active, .knapp.fyll { color: #111113; }
    .knapp:active { transform: translateY(1px); }
    .prim { background: var(--knapp); color: var(--knapptext); }
    .sek { color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--linje); }
    .sek:active, .sek.fyll { box-shadow: inset 0 0 0 1.5px transparent; }
    a:focus-visible { outline: 2.5px solid var(--accent); outline-offset: 3px; }
    """

    /// Typsnitten och bilderna ur `App/Skydd/Bunt/`, inbäddade en gång.
    enum Tillgangar {
        static let typsnitt: String = {
            var css = ""
            if let d = Bunt.data("Skydd", "fraunces.woff2") {
                css += "@font-face { font-family: \"AdRaze Display\"; src: url(data:font/woff2;base64,\(d.base64EncodedString())) format(\"woff2\"); font-weight: 100 900; font-style: normal; font-display: block; }\n"
            }
            if let d = Bunt.data("Skydd", "familjen.woff2") {
                css += "@font-face { font-family: \"Familjen Grotesk\"; src: url(data:font/woff2;base64,\(d.base64EncodedString())) format(\"woff2\"); font-weight: 400 700; font-style: normal; font-display: block; }\n"
            }
            return css
        }()

        static let gorilla: String = {
            guard let d = Bunt.data("Skydd", "gorilla.png") else { return "" }
            return "data:image/png;base64," + d.base64EncodedString()
        }()

        /// Sajtens figur (site/illu/blocked.svg) inbäddad som SVG, så att den kan färgas om i mörkt läge.
        static let figur: String = {
            guard let d = Bunt.data("Skydd", "blocked.svg"), var s = String(data: d, encoding: .utf8) else { return "" }
            if let r = s.range(of: "<?xml") , let slut = s.range(of: "?>", range: r.upperBound..<s.endIndex) { s.removeSubrange(r.lowerBound..<slut.upperBound) }
            return s
        }()
    }
}
