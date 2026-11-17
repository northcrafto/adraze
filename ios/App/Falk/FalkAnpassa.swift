import Foundation

/// Falk ändrar Anpassa-inställningar med vanligt språk: `anpassa-falk:lista` och `anpassa-falk:gor`, samma svar som
/// datorns `browser/anpassa-falk.js` (sidans `ui/anpassa-falk.js` visar dem oförändrad).
///
/// Allt avgörs här, aldrig på sidan:
///  - bara nycklar som finns i registret (`app.installningar.registret`), läst vid varje anrop
///  - bara giltiga värden: ett av nyckelns val, ett tal i intervallet, på/av, en färg eller text
///  - barnlåsta nycklar ändras aldrig i barnläge
///  - nycklar som kan ändra sökningen eller köra kod (barnlåsta, icke importerbara, `avancerat.*`) ändras först
///    när användaren godkänt i en ruta med "Avbryt" förvalt: Falks svar kan bygga på text från en webbsida.
///
/// På iPhone rör Falk inte webbinställningarna, blockeringen, språket eller det som bara finns på datorn (`utanfor`).
///
/// Ägare: Falk.
@MainActor
enum FalkAnpassa {
    static let utanfor = ["webb.", "block.", "sprak.", "avancerat.", "sidopanel.", "kortkommandon.", "gester.", "falk.bredd"]

    static func tillaten(_ nyckel: String) -> Bool { !utanfor.contains { nyckel == $0 || nyckel.hasPrefix($0) } }

    static func register(_ app: AppMiljo) -> [String: Installningsdef] {
        app.installningar.registret.filter { tillaten($0.key) }
    }

    static let varning = "Förslaget kommer från Falk (AI) och kan bygga på text från en webbsida, ett mejl eller en sökträff. Godkänn bara om det var du som bad om det."

    // MARK: - Vanliga sätt att säga värdena (datorns KANDA och FARGER)

    struct Kand {
        let val: [JSONVarde]
        let syn: [String: JSONVarde]
    }

    static let kanda: [String: Kand] = [
        "tema.lage": Kand(val: ["ljust", "morkt", "system"], syn: [
            "ljus": "ljust", "light": "ljust", "dag": "ljust", "mork": "morkt", "dark": "morkt", "natt": "morkt", "morkerlage": "morkt",
            "morklage": "morkt", "auto": "system", "automatiskt": "system", "datorns": "system", "samma_som_datorn": "system",
            "folj_datorn": "system", "folj_systemet": "system", "telefonens": "system", "folj_telefonen": "system",
            "samma_som_telefonen": "system"]),
        "tema.densitet": Kand(val: ["kompakt", "normal", "luftig"], syn: [
            "kompaktare": "kompakt", "tat": "kompakt", "tatare": "kompakt", "mindre": "kompakt", "tight": "kompakt", "mellan": "normal",
            "vanlig": "normal", "luftigare": "luftig", "rymlig": "luftig", "rymligare": "luftig", "storre": "luftig", "glesare": "luftig"]),
        "tema.horn": Kand(val: ["kantig", "normal", "rund"], syn: [
            "kantigare": "kantig", "kantiga": "kantig", "fyrkantig": "kantig", "skarp": "kantig", "skarpa": "kantig", "raka": "kantig",
            "rundare": "rund", "runda": "rund", "rundade": "rund", "mjuk": "rund", "mjuka": "rund"]),
        "tema.typsnitt": Kand(val: ["system", "klassisk", "tydlig", "serif", "mono"], syn: [
            "vanlig": "system", "vanligt": "system", "klassiskt": "klassisk", "tydligt": "tydlig", "tydligare": "tydlig", "lattlast": "tydlig",
            "lattlasta": "tydlig", "seriff": "serif", "antikva": "serif", "monospace": "mono", "kod": "mono", "kodtypsnitt": "mono"]),
        "tema.storlek": Kand(val: ["liten", "normal", "stor"], syn: [
            "mindre": "liten", "sma": "liten", "liten_text": "liten", "mindre_text": "liten", "storre": "stor", "stora": "stor",
            "stor_text": "stor", "storre_text": "stor", "vanlig": "normal", "mellan": "normal"]),
        "flikar.lage": Kand(val: ["upptill", "vertikal", "dolda"], syn: [
            "vertikalt": "vertikal", "vertikala": "vertikal", "sidan": "vertikal", "pa_sidan": "vertikal", "vansterkant": "vertikal",
            "sidopanel": "vertikal", "uppe": "upptill", "overst": "upptill", "horisontellt": "upptill", "horisontella": "upptill",
            "vanligt": "upptill", "dold": "dolda", "gomda": "dolda", "gom": "dolda", "dolj": "dolda", "inga": "dolda"]),
        "flikar.nyFlik": Kand(val: ["sist", "bredvid"], syn: [
            "sista": "sist", "slutet": "sist", "i_slutet": "sist", "langst_bort": "sist", "intill": "bredvid", "bredvid_aktuell": "bredvid",
            "efter_aktuell": "bredvid", "bredvid_den_aktiva": "bredvid"]),
        "flikar.sistaFlik": Kand(val: ["stang", "ny"], syn: [
            "stang_fonstret": "stang", "stangs": "stang", "ny_flik": "ny", "oppna_ny_flik": "ny", "oppna_en_ny_flik": "ny", "behall_fonstret": "ny"]),
        "flikar.stangKnapp": Kand(val: ["alla", "aktiv"], syn: [
            "pa_alla": "alla", "alla_flikar": "alla", "aktiva": "aktiv", "bara_aktiv": "aktiv", "bara_den_aktiva": "aktiv", "aktiv_flik": "aktiv"]),
        "flikar.sova": Kand(val: [0, 15, 30, 60, 120], syn: [
            "av": 0, "aldrig": 0, "kvart": 15, "en_kvart": 15, "halvtimme": 30, "en_halvtimme": 30, "timme": 60, "en_timme": 60, "tva_timmar": 120]),
        "verktyg.placering": Kand(val: ["uppe", "nere"], syn: [
            "upptill": "uppe", "overst": "uppe", "nertill": "nere", "botten": "nere", "langst_ner": "nere", "nederst": "nere"]),
        "verktyg.adress": Kand(val: ["hel", "doman"], syn: [
            "hela": "hel", "hela_adressen": "hel", "hel_adress": "hel", "full": "hel", "domanen": "doman", "bara_domanen": "doman",
            "domain": "doman", "kort": "doman"]),
        "verktyg.bokmarkesfalt": Kand(val: ["alltid", "nyflik", "aldrig"], syn: [
            "visa": "alltid", "pa": "alltid", "ny_flik": "nyflik", "bara_pa_ny_flik": "nyflik", "pa_ny_flik": "nyflik", "dolj": "aldrig",
            "dold": "aldrig", "av": "aldrig", "gom": "aldrig"]),
    ]

    static let farger: [String: String] = [
        "rod": "#d64b45", "rott": "#d64b45", "red": "#d64b45", "morkrod": "#9b1c1c", "vinrod": "#7f1d3a", "rosa": "#e0559a", "pink": "#e0559a",
        "cerise": "#d6336c", "orange": "#ff4b1f", "gul": "#e0b100", "yellow": "#e0b100", "guld": "#c9a227", "gold": "#c9a227", "senap": "#c98a12",
        "gron": "#2f9e67", "green": "#2f9e67", "morkgron": "#1f6b3a", "darkgreen": "#1f6b3a", "skogsgron": "#1f5135", "ljusgron": "#5fd08a",
        "lightgreen": "#5fd08a", "mint": "#3eb489", "mintgron": "#3eb489", "oliv": "#6b7a2a", "olivgron": "#6b7a2a", "turkos": "#0f9fb0",
        "teal": "#0f8b8d", "petrol": "#0f6b73", "bla": "#1d6fd8", "blue": "#1d6fd8", "morkbla": "#1e3a8a", "darkblue": "#1e3a8a", "marin": "#0e2a47",
        "marinbla": "#0e2a47", "navy": "#0e2a47", "ljusbla": "#60a5fa", "lightblue": "#60a5fa", "himmelsbla": "#38bdf8", "lila": "#7c3aed",
        "purple": "#7c3aed", "violett": "#6d28d9", "brun": "#8b5a2b", "brown": "#8b5a2b", "gra": "#6b7280", "grey": "#6b7280", "gray": "#6b7280",
        "morkgra": "#374151", "ljusgra": "#9ca3af", "grafit": "#3f4652", "svart": "#141416", "black": "#141416", "vit": "#ffffff", "white": "#ffffff",
    ]

    /// Vanliga namn på områdena → nyckelns första del.
    static let omraden: [String: String] = [
        "utseende": "tema", "utseendet": "tema", "farger": "tema", "fargerna": "tema", "temat": "tema", "flikarna": "flikar",
        "verktygsfalt": "verktyg", "verktygsfaltet": "verktyg", "knappar": "verktyg", "knapparna": "verktyg", "startsidan": "startsida",
        "sokmotor": "sok", "sokmotorer": "sok", "sokmotorerna": "sok", "arbetsytorna": "arbetsytor", "sajter": "sajt", "sajterna": "sajt",
        "galleriet": "galleri", "temagalleriet": "galleri",
    ]

    // MARK: - Vad en nyckel kan ha

    enum Slag { case val, tal, text, paAv, farg }

    static func valFor(_ nyckel: String, _ def: Installningsdef?) -> Installningsval? {
        guard let def else { return nil }
        if let v = def.val { return v }
        if let k = kanda[nyckel], let std = def.standard, k.val.contains(std) { return .lista(k.val) }
        return nil
    }

    static func slag(_ nyckel: String, _ def: Installningsdef?) -> Slag? {
        guard let def else { return nil }
        switch valFor(nyckel, def) {
        case .lista?: return .val
        case .text?: return .text
        case .intervall?: return .tal
        case nil: break
        }
        if case .bool? = def.standard { return .paAv }
        if case .text(let s)? = def.standard, s.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil { return .farg }
        return nil
    }

    /// Frågar först: kan ändra sökningen eller köra kod (samma nycklar som barnläget låser).
    static func risk(_ nyckel: String, _ def: Installningsdef?) -> Bool {
        nyckel.hasPrefix("avancerat.") || (def.map { $0.barnlast || !$0.importbar } ?? false)
    }

    /// NYCKEL → nyckeln i registret (å/ä/ö och versaler går bra; `sajt.*`-mönster ger `sajt.<namn>`).
    static func hittaDef(_ namn: String, _ reg: [String: Installningsdef]) -> (nyckel: String, def: Installningsdef)? {
        let f = Falk.fold(namn).replacingOccurrences(of: #"\s+"#, with: "", options: .regularExpression)
        guard !f.isEmpty else { return nil }
        for k in reg.keys.sorted() where !k.hasSuffix(".*") && Falk.fold(k) == f { return (k, reg[k]!) }
        for k in reg.keys.sorted() where k.hasSuffix(".*") {
            let p = String(k.dropLast())
            if f.hasPrefix(Falk.fold(p)), f.count > p.count {
                let resten = namn.trimmingCharacters(in: .whitespaces).dropFirst(p.count).trimmingCharacters(in: .whitespaces).lowercased()
                return (p + resten, reg[k]!)
            }
        }
        return nil
    }

    static func farg(_ t: String) -> String? {
        var s = t.trimmingCharacters(in: .whitespaces).lowercased()
        if s.range(of: "^#?[0-9a-f]{6}$", options: .regularExpression) != nil { return "#" + s.replacingOccurrences(of: "#", with: "") }
        if s.range(of: "^#?[0-9a-f]{3}$", options: .regularExpression) != nil {
            s = s.replacingOccurrences(of: "#", with: "")
            return "#" + s.map { "\($0)\($0)" }.joined()
        }
        let f = Falk.fold(s).replacingOccurrences(of: #"[\s-]+"#, with: "", options: .regularExpression)
        let varianter = [f, f.replacingOccurrences(of: "tt$", with: "", options: .regularExpression),
                         f.replacingOccurrences(of: "[at]$", with: "", options: .regularExpression),
                         f.replacingOccurrences(of: "a$", with: "", options: .regularExpression)]
        for v in varianter { if let h = farger[v] { return h } }
        return nil
    }

    /// "30", "30 min", "1 timme" → tal (timmar räknas om till minuter).
    static func talAv(_ t: String) -> Double? {
        let s = t.trimmingCharacters(in: .whitespaces)
        guard let r = s.range(of: #"^-?\d+(?:[.,]\d+)?"#, options: .regularExpression),
              let n = Double(s[r].replacingOccurrences(of: ",", with: ".")) else { return nil }
        return Falk.fold(String(s[r.upperBound...])).hasPrefix("tim") ? n * 60 : n
    }

    static func ra(_ v: JSONVarde) -> String {
        switch v {
        case .text(let s): return s
        case .tal(let n): return n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
        case .bool(let b): return b ? "true" : "false"
        default: return v.jsonText
        }
    }

    enum Tolkat {
        /// `nil` = tillbaka till standard.
        case varde(JSONVarde?)
        case fel(String)
    }

    static func tolka(_ nyckel: String, _ def: Installningsdef, _ text: String) -> Tolkat {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: "^(standard|aterstall|återställ|default|ursprunglig|ursprungligt)$", options: [.regularExpression, .caseInsensitive]) != nil {
            return .varde(nil)
        }
        let f = Falk.fold(t).replacingOccurrences(of: #"\s+"#, with: "_", options: .regularExpression)
        switch slag(nyckel, def) {
        case .val?:
            guard case .lista(let val)? = valFor(nyckel, def) else { break }
            var v = val.first { Falk.fold(ra($0)) == f }
            if v == nil, let x = kanda[nyckel]?.syn[f], val.contains(x) { v = x }
            if v == nil, val.allSatisfy({ $0.tal != nil }), let n = talAv(t), let x = val.first(where: { $0.tal == n }) { v = x }
            if let v { return .varde(v) }
            return .fel(FalkSprak.fyll("Tillåtna värden: {x}.", ["x": val.map(ra).joined(separator: ", ")]))
        case .tal?:
            guard case .intervall(let lo, let hi)? = valFor(nyckel, def) else { break }
            if let n = talAv(t), n >= lo, n <= hi { return .varde(.tal(n)) }
            return .fel(FalkSprak.fyll("Skriv ett tal från {min} till {max}.", ["min": ra(.tal(lo)), "max": ra(.tal(hi))]))
        case .text?:
            return t.count <= 500 ? .varde(.text(t)) : .fel("Texten är för lång.")
        case .paAv?:
            if f.range(of: "^(pa|ja|true|on|1|aktiv|aktivera|visa|sla_pa|tand)$", options: .regularExpression) != nil { return .varde(.bool(true)) }
            if f.range(of: "^(av|nej|false|off|0|inaktiv|stang_av|dolj|gom|slack)$", options: .regularExpression) != nil { return .varde(.bool(false)) }
            return .fel("Skriv på eller av.")
        case .farg?:
            if let h = farg(t) { return .varde(.text(h)) }
            return .fel("Skriv färgen som hex, t.ex. #1f6b3a.")
        case nil:
            break
        }
        return .fel("Den ändrar du själv i Inställningar → Anpassa.")
    }

    static func visaVarde(_ v: JSONVarde?) -> String {
        guard let v, !v.arNull else { return "standard" }
        switch v {
        case .bool(let b): return b ? "på" : "av"
        case .lista, .objekt: return "(…)"
        default:
            let s = ra(v)
            return s.count > 60 ? String(s.prefix(57)) + "…" : s
        }
    }

    static func sann(_ v: JSONVarde) -> Bool {
        switch v {
        case .null: return false
        case .bool(let b): return b
        case .tal(let n): return n != 0
        case .text(let s): return !s.isEmpty
        default: return true
        }
    }

    /// Det Falk får se av värdet nu. Sådant som frågar först (egen kod och liknande) skickas aldrig till AI-tjänsten.
    static func visaNu(_ app: AppMiljo, _ nyckel: String, _ def: Installningsdef) -> String {
        let v = app.installningar.hamta(nyckel)
        if risk(nyckel, def), v?.bool == nil {
            let tom: Bool
            switch v {
            case nil, .null?: tom = true
            case .text(let s)?: tom = s.isEmpty
            case .lista(let l)?: tom = l.isEmpty
            case .objekt(let o)?: tom = !o.values.contains(where: sann)
            default: tom = false
            }
            if tom { return "(tomt)" }
            if case .lista(let l)? = v { return "(\(l.count) st)" }
            return "(eget innehåll)"
        }
        return visaVarde(v)
    }

    static func valText(_ nyckel: String, _ def: Installningsdef) -> String {
        switch slag(nyckel, def) {
        case .val?:
            if case .lista(let l)? = valFor(nyckel, def) { return l.map(ra).joined(separator: " | ") }
            return "ändras i Inställningar"
        case .tal?:
            if case .intervall(let lo, let hi)? = valFor(nyckel, def) { return "tal \(ra(.tal(lo)))–\(ra(.tal(hi)))" }
            return "ändras i Inställningar"
        case .text?: return "text"
        case .paAv?: return "på | av"
        case .farg?: return "färg (#rrggbb)"
        case nil: return "ändras i Inställningar"
        }
    }

    // MARK: - anpassa-falk:lista

    /// Listan i Falks instruktioner: nyckel, vad den gör, värdet nu och vilka värden som går. Det Falk inte kan ändra
    /// slås ihop per område när det är fler än tre.
    static func lista(_ app: AppMiljo) -> JSONVarde {
        var ut: [[String: JSONVarde]] = []
        var ovriga: [String: [[String: JSONVarde]]] = [:]
        var omradesordning: [String] = []
        for (k, d) in register(app).sorted(by: { $0.key < $1.key }) {
            let monster = k.hasSuffix(".*")
            var rad: [String: JSONVarde] = [
                "nyckel": .text(monster ? String(k.dropLast()) + "<namn>" : k), "etikett": .text(String((d.etikett.isEmpty ? k : d.etikett).prefix(80))),
                "nu": "", "val": .text(valText(k, d)), "fraga": .bool(risk(k, d)), "last": .bool(app.installningar.arLast(k)),
            ]
            if !monster && slag(k, d) != nil {
                rad["nu"] = .text(visaNu(app, k, d))
                ut.append(rad)
                continue
            }
            let omr = String(k.split(separator: ".").first ?? "")
            if ovriga[omr] == nil { omradesordning.append(omr) }
            rad["val"] = "ändras i Inställningar"
            rad["fraga"] = false
            rad["last"] = false
            ovriga[omr, default: []].append(rad)
        }
        for omr in omradesordning {
            let rader = ovriga[omr] ?? []
            if rader.count <= 3 { ut += rader; continue }
            let namn = rader.prefix(3).compactMap { $0["etikett"]?.text }.joined(separator: ", ")
            ut.append(["nyckel": .text(omr + ".…"), "etikett": .text("\(namn) m.fl. (\(rader.count) st)"), "nu": "",
                       "val": "ändras i Inställningar", "fraga": false, "last": false])
        }
        ut.sort { ($0["nyckel"]?.text ?? "") < ($1["nyckel"]?.text ?? "") }
        return .lista(ut.map { .objekt($0) })
    }

    // MARK: - anpassa-falk:gor

    private static func utanFalk(_ s: String) -> String { s.hasPrefix("Falk: ") ? String(s.dropFirst(6)) : s }

    /// `{ name, value }` som i Falks tagg. Svar: `{ ok: true, vad, … }` eller `{ ok: false, fel, stoppad?, last? }`.
    static func gor(_ app: AppMiljo, _ a: JSONVarde) async -> JSONVarde {
        let namn = Falk.fold(a["name"].text ?? "").replacingOccurrences(of: #"\s+"#, with: "_", options: .regularExpression)
        let text = String((a["value"].text ?? a["value"].tal.map { ra(.tal($0)) } ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(8000))
        let inst = app.installningar
        let reg = register(app)

        if namn == "anpassa_angra" || namn == "angra" {
            guard let senaste = inst.historik.last(where: { !inst.arLast($0.nyckel) }) else {
                return ["ok": false, "fel": "Det finns inget att ångra."]
            }
            if let h = hittaDef(senaste.nyckel, inst.registret), risk(h.nyckel, h.def) {
                let ja = await FalkHandlingar.fraga(ft("Falk vill ångra en ändring av \"{x}\".", ["x": ft(utanFalk(senaste.etikett))]), detalj: ft(varning))
                if !ja { return ["ok": false, "fel": "Du stoppade ändringen.", "stoppad": true] }
            }
            let r = inst.angra()
            guard r.ok else { return ["ok": false, "fel": "Det finns inget att ångra."] }
            let et = utanFalk(r.etikett ?? r.nyckel ?? "")
            return ["ok": true, "vad": .text(et), "antal": 1, "etiketter": .lista([.text(et)])]
        }

        if namn == "anpassa_aterstall" || namn == "aterstall" {
            var o = Falk.fold(text).replacingOccurrences(of: #"\.+$"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: "", options: .regularExpression)
            let allt = o.isEmpty || o.range(of: "^(allt|alla|allting|hela|everything|all)$", options: .regularExpression) != nil
            if !allt {
                o = omraden[o] ?? o
                guard let k = reg.keys.sorted().first(where: { Falk.fold($0).hasPrefix(o + ".") }) else {
                    return ["ok": false, "fel": .text(FalkSprak.fyll("Det finns inget område som heter {x}.", ["x": String(text.prefix(40))]))]
                }
                o = String(k.split(separator: ".").first ?? "")
            }
            let vad = allt ? "allt" : o
            let berors = inst.varden.keys.filter { tillaten($0) && (allt || $0.hasPrefix(o + ".")) && !inst.arLast($0) }.sorted()
            if berors.isEmpty { return ["ok": true, "vad": .text(vad), "antal": 0, "redan": true] }
            let farlig = berors.contains { k in
                if let h = hittaDef(k, inst.registret) { return risk(h.nyckel, h.def) }
                return risk(k, nil)
            }
            if allt || farlig {
                let fragan = allt ? ft("Falk vill återställa alla dina anpassningar till standard.") : ft("Falk vill återställa \"{x}\" till standard.", ["x": o])
                let ja = await FalkHandlingar.fraga(fragan, detalj: ft("Det går att ångra efteråt.") + "\n\n" + ft(varning))
                if !ja { return ["ok": false, "fel": "Du stoppade ändringen.", "stoppad": true] }
            }
            for k in berors { inst.satt(k, nil, etikett: allt ? "Falk: Återställ allt" : "Falk: Återställ \(o)") }
            return ["ok": true, "vad": .text(vad), "antal": .tal(Double(berors.count)), "redan": false]
        }

        guard namn == "anpassa" else { return ["ok": false, "fel": "Okänd handling."] }
        guard let i = text.firstIndex(of: "|") ?? text.firstIndex(of: "="), i > text.startIndex else {
            return ["ok": false, "fel": "Skriv både inställning och värde."]
        }
        let nyckelText = String(text[..<i])
        guard let (nyckel, def) = hittaDef(nyckelText, reg) else {
            let x = String(nyckelText.trimmingCharacters(in: .whitespaces).prefix(60))
            return ["ok": false, "fel": .text(FalkSprak.fyll("Den inställningen finns inte: {x}", ["x": x]))]
        }
        let et = def.etikett.isEmpty ? nyckel : def.etikett
        if inst.arLast(nyckel) { return ["ok": false, "fel": "Går inte att ändra i barnläge.", "last": true, "etikett": .text(et)] }
        guard slag(nyckel, def) != nil else { return ["ok": false, "fel": "Den ändrar du själv i Inställningar → Anpassa.", "etikett": .text(et)] }
        let ny: JSONVarde?
        switch tolka(nyckel, def, String(text[text.index(after: i)...])) {
        case .fel(let f): return ["ok": false, "fel": .text(f), "etikett": .text(et)]
        case .varde(let v): ny = v
        }
        let nu = inst.hamta(nyckel)
        let blir = ny ?? def.standard
        let vad = et + ": " + visaVarde(blir)
        if nu == blir { return ["ok": true, "nyckel": .text(nyckel), "etikett": .text(et), "varde": blir ?? .null, "redan": true, "vad": .text(vad)] }
        if risk(nyckel, def) {
            let nytt: String
            if let ny, case .text(let s) = ny { nytt = String(s.prefix(400)) } else { nytt = ft(visaVarde(ny)) }
            let ja = await FalkHandlingar.fraga(ft("Falk vill ändra \"{x}\".", ["x": ft(et)]),
                                                detalj: ft("Nytt värde: {x}", ["x": nytt]) + "\n\n" + ft(varning))
            if !ja { return ["ok": false, "fel": "Du stoppade ändringen.", "stoppad": true, "etikett": .text(et)] }
        }
        switch inst.satt(nyckel, ny, etikett: "Falk: " + et) {
        case .ok: return ["ok": true, "nyckel": .text(nyckel), "etikett": .text(et), "varde": ny ?? .null, "vad": .text(vad)]
        case .barnlast: return ["ok": false, "fel": "Går inte att ändra i barnläge.", "last": true, "etikett": .text(et)]
        case .nyckel: return ["ok": false, "fel": "Det gick inte att spara.", "etikett": .text(et)]
        }
    }
}
