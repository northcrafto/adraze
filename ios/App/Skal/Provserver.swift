import Foundation
import Network

/// En liten HTTP-server på 127.0.0.1 för självtestet, så att skalet provas mot LOKALA sidor (inget nät behövs,
/// och `file:` släpps inte in av flikarna). Lyssnar bara på den egna datorns loopback.
///
/// Ägare: Skal.
final class Provserver: @unchecked Sendable {
    private var lyssnare: NWListener?
    private let ko = DispatchQueue(label: "app.adraze.skal.provserver")
    private let sidor: [String: String]
    private(set) var antalBegaran = 0

    init(sidor: [String: String]) {
        self.sidor = sidor
    }

    /// Startar servern och ger porten.
    func starta() async throws -> UInt16 {
        let p = NWParameters.tcp
        p.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        p.allowLocalEndpointReuse = true
        let l = try NWListener(using: p)
        l.newConnectionHandler = { [weak self] c in self?.hantera(c) }
        lyssnare = l
        return try await withCheckedThrowingContinuation { (fort: CheckedContinuation<UInt16, Error>) in
            let klar = Atomisk()
            l.stateUpdateHandler = { s in
                switch s {
                case .ready:
                    if klar.forsta() { fort.resume(returning: l.port?.rawValue ?? 0) }
                case .failed(let e):
                    if klar.forsta() { fort.resume(throwing: e) }
                case .cancelled:
                    if klar.forsta() { fort.resume(throwing: CancellationError()) }
                default:
                    break
                }
            }
            l.start(queue: ko)
        }
    }

    func stoppa() {
        lyssnare?.cancel()
        lyssnare = nil
    }

    private func hantera(_ c: NWConnection) {
        c.start(queue: ko)
        c.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, _, _ in
            guard let self else { c.cancel(); return }
            self.antalBegaran += 1
            let begaran = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let forsta = begaran.components(separatedBy: "\r\n").first ?? ""
            let delar = forsta.split(separator: " ")
            var vag = delar.count > 1 ? String(delar[1]) : "/"
            if let q = vag.firstIndex(of: "?") { vag = String(vag[..<q]) }
            // En trasig server: stänger utan svar (för felsidan).
            if vag == "/trasig" { c.cancel(); return }
            let kropp = self.sidor[vag]
            let b = Data((kropp ?? "<!doctype html><title>Hittades inte</title><h1>404</h1>").utf8)
            let huvud = "HTTP/1.1 \(kropp == nil ? "404 Not Found" : "200 OK")\r\n"
                + "Content-Type: text/html; charset=utf-8\r\nContent-Length: \(b.count)\r\n"
                + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
            var ut = Data(huvud.utf8)
            ut.append(b)
            c.send(content: ut, completion: .contentProcessed { _ in c.cancel() })
        }
    }

    /// Sant första gången (för fortsättningen ovan, som bara får återupptas en gång).
    private final class Atomisk: @unchecked Sendable {
        private let las = NSLock()
        private var gjort = false
        func forsta() -> Bool {
            las.lock()
            defer { las.unlock() }
            if gjort { return false }
            gjort = true
            return true
        }
    }
}

/// Provsidorna: en tidning, ett kafé och en lång läsning. Egna texter, inga externa resurser.
enum Provsidor {
    static let alla: [String: String] = ["/": fjallbladet, "/kaffe": kaffekartan, "/lang": langLasning]

    private static let bas = """
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root { color-scheme: light dark; --p: #f4efe6; --t: #23201b; --d: #6c665c; --a: #2f6b4f; --k: #fffaf2; --l: #e3dccf; }
      @media (prefers-color-scheme: dark) { :root { --p: #171613; --t: #ece6da; --d: #a59d8f; --a: #7cc4a0; --k: #211f1b; --l: #34312b; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--p); color: var(--t); font: 17px/1.55 -apple-system, system-ui, sans-serif; }
      header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--l); }
      .logga { font: 700 22px/1 Georgia, serif; letter-spacing: -.3px; }
      .logga span { color: var(--a); }
      nav { font-size: 13px; color: var(--d); display: flex; gap: 14px; }
      .hjalte { height: 230px; position: relative; overflow: hidden; background: linear-gradient(180deg, #f6c48f 0%, #f1a86b 38%, #b6795a 100%); }
      .hjalte svg { position: absolute; bottom: 0; width: 100%; height: 100%; }
      main { padding: 6px 20px 40px; max-width: 680px; margin: 0 auto; }
      .etikett { display: inline-block; margin-top: 18px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--a); }
      h1 { font: 700 31px/1.12 Georgia, serif; margin: 8px 0 10px; letter-spacing: -.4px; }
      .ingress { font-size: 18.5px; color: var(--d); margin: 0 0 16px; }
      .byline { font-size: 13px; color: var(--d); padding-bottom: 14px; border-bottom: 1px solid var(--l); margin-bottom: 18px; }
      .kort { background: var(--k); border: 1px solid var(--l); border-radius: 14px; padding: 16px; margin: 22px 0; }
      .kort b { display: block; margin-bottom: 6px; }
      h2 { font: 700 22px/1.2 Georgia, serif; margin: 28px 0 8px; }
    </style>
    """

    static let fjallbladet = """
    <!doctype html><html lang="sv"><head><meta charset="utf-8">
    <title>Fjällbladet – Höstens vackraste leder</title>
    <meta name="theme-color" content="#f4efe6" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#171613" media="(prefers-color-scheme: dark)">
    \(bas)
    </head><body>
    <header><div class="logga">Fjäll<span>bladet</span></div><nav><span>Leder</span><span>Utrustning</span><span>Väder</span></nav></header>
    <div class="hjalte"><svg viewBox="0 0 400 230" preserveAspectRatio="none">
      <circle cx="300" cy="70" r="28" fill="#fff3d6" opacity=".9"/>
      <path d="M0 170 L70 95 L120 140 L190 60 L260 150 L320 105 L400 165 L400 230 L0 230Z" fill="#7a5a4e"/>
      <path d="M0 200 L60 150 L130 190 L210 120 L280 185 L350 150 L400 190 L400 230 L0 230Z" fill="#4e3b36"/>
      <path d="M190 60 L172 80 L186 78 L196 88 L206 74 Z" fill="#fff8ee"/>
    </svg></div>
    <main>
      <span class="etikett">Vandring</span>
      <h1>Höstens vackraste leder – sju turer när björkarna gulnar</h1>
      <p class="ingress">Från korta dagsturer till fyra dagar över kalfjället. Vi har gått dem alla och vet var kaffet smakar bäst.</p>
      <div class="byline">Av Saga Lindqvist · 8 min läsning</div>
      <p>Det finns en vecka i september när fjället byter färg nästan över natten. Björkarna längs dalgångarna blir gula, ripbären lyser rött och luften är så klar att man ser toppar som ligger tre mil bort.</p>
      <p>Vi har valt sju leder som passar olika ben och olika mycket tid. Alla går att nå med tåg eller buss, och de flesta har stugor där du kan torka kläderna efter en blöt dag.</p>
      <div class="kort"><b>Bäst för nybörjare</b>Leden mellan Abisko och Trollsjön: 22 kilometer, nästan platt, med en av Sveriges klaraste sjöar som mål.</div>
      <h2>1. Kungsleden, Abisko – Alesjaure</h2>
      <p>Den klassiska starten. Första dagen följer du Abiskojåkka genom björkskog innan landskapet öppnar sig och kalfjället tar över.</p>
      <p>Ta det lugnt den andra dagen. Bron över Kamajåkka är ett bra ställe för lunch, och om vinden ligger rätt hör du forsen långt innan du ser den.</p>
      <h2>2. Helags runt</h2>
      <p>Sveriges sydligaste glaciär ligger mitt på rundan. Leden är väl markerad men kan vara blöt efter regn, så ta stövlar eller vattentäta kängor.</p>
      <p>Fjällstationen har både bastu och ett bageri som säljer kanelbullar till den som kommer ner innan klockan fyra.</p>
      <h2>3. Sarek från Kvikkjokk</h2>
      <p>Det här är för den som vill ha vildmark på riktigt. Inga markerade leder, inga stugor och inga broar – bara karta, kompass och mycket tid.</p>
      <p>Planera för minst en reservdag. Vädret kan stänga passen, och då är det bättre att vänta i tältet än att chansa.</p>
    </main></body></html>
    """

    static let kaffekartan = """
    <!doctype html><html lang="sv"><head><meta charset="utf-8">
    <title>Kaffekartan – Rosterier i Göteborg</title>
    <meta name="theme-color" content="#1d2a24">
    \(bas)
    <style> body { background: #f2f0ea; } .topp { background: #1d2a24; color: #f3efe6; padding: 28px 20px 30px; }
      .topp h1 { color: #f3efe6; } .topp p { color: #b9c4bd; margin: 0; } .rad { display: flex; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid #dcd7cc; }
      .prick { width: 44px; height: 44px; border-radius: 12px; background: #c98b4f; flex: none; } .rad small { color: #6c665c; display: block; }
      @media (prefers-color-scheme: dark) { body { background: #141513; } .rad { border-color: #2c2e2a; } }
    </style>
    </head><body>
    <div class="topp"><div class="logga" style="color:#e9c79a">Kaffekartan</div><h1>Tolv rosterier värda en omväg</h1><p>Uppdaterad i oktober. Vi har druckit allt, så att du slipper.</p></div>
    <main>
      <div class="rad"><div class="prick"></div><div><b>Bönan vid kanalen</b><small>Ljusrostat, egen import från Etiopien</small></div></div>
      <div class="rad"><div class="prick" style="background:#7d5a3c"></div><div><b>Sju Kvarnar</b><small>Espresso med mörk choklad i botten</small></div></div>
      <div class="rad"><div class="prick" style="background:#a3b18a"></div><div><b>Hamnrosteriet</b><small>Öppet från sju, bullar från åtta</small></div></div>
      <div class="rad"><div class="prick" style="background:#d9a441"></div><div><b>Gula huset</b><small>Filterkaffe på beställning, lugn innergård</small></div></div>
      <p>Alla rosterier på listan säljer bönor att ta med, och de flesta maler åt dig om du säger vilken bryggare du har.</p>
    </main></body></html>
    """

    static let langLasning: String = {
        var stycken = ""
        for i in 1...40 {
            stycken += "<h2>Del \(i)</h2><p>Det här är en lång text för att prova hur raderna fälls ihop när man scrollar. "
                + "Stycke \(i) handlar om hur man packar en ryggsäck: det tunga närmast ryggen, det man behöver ofta överst, "
                + "och regnkläderna där de går att nå utan att plocka ur allt annat.</p>"
        }
        return """
        <!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Lång läsning – Packa rätt</title>\(bas)</head>
        <body><header><div class="logga">Lång <span>läsning</span></div></header><main><h1>Packa rätt för en vecka i fjällen</h1>\(stycken)</main></body></html>
        """
    }()
}
