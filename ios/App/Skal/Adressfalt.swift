import SwiftUI
import UIKit

/// Adressfältet när man inte skriver: skölden med antalet stoppade på sidan, domänen (resten av adressen
/// dämpad), ladda om eller stoppa, och en tunn accentlinje för hur långt sidan har laddat. Tryck för att
/// skriva, svep åt sidan för att byta flik, håll inne för att kopiera eller klistra in.
///
/// Ägare: Skal.
struct Adressfalt: View {
    let flik: (any Flik)?
    let skal: SkalLage
    let farger: Skalfarger

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.dynamicTypeSize) private var typ
    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var svep: CGFloat = 0
    @State private var bytt = false

    var body: some View {
        let hojd = tema.matt.adressfalt * Skrift.faktor(typ, tak: 1.3)
        let radie = min(tema.radier.falt, hojd / 2)
        let form = RoundedRectangle(cornerRadius: radie, style: .continuous)
        HStack(spacing: 2) {
            Skoldchip(flik: flik, skal: skal, farger: farger)
            Button { skal.borjaRedigera() } label: {
                Adresstext(flik: flik, farger: farger)
                    .frame(maxWidth: .infinity, minHeight: hojd)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tr("Adressfält"))
            .accessibilityValue(Webbadress.visning(visadAdress(flik), installningar: app.installningar))
            .accessibilityHint(tr("Tryck för att söka eller skriva en adress"))
            Laddaknapp(flik: flik, farger: farger)
        }
        .padding(.horizontal, 4)
        .offset(x: svep)
        .opacity(1 - min(0.6, Double(abs(svep)) / 260))
        .frame(height: hojd)
        .background {
            form.fill(farger.falt)
                .shadow(color: Color.black.opacity(farger.privat ? 0 : 0.06), radius: 1.5, y: 1)
        }
        .overlay { form.strokeBorder(farger.faltlinje, lineWidth: 1) }
        .overlay(alignment: .bottom) {
            Laddlinje(flik: flik, farg: farger.accent)
                .clipShape(form)
        }
        .clipShape(form.inset(by: -1))
        .contentShape(form)
        .simultaneousGesture(svepgest)
        .onLongPressGesture(minimumDuration: 0.5) { visaFaltval() }
    }

    /// Svep åt vänster: nästa flik (eller en ny), åt höger: förra.
    private var svepgest: some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { g in
                guard abs(g.translation.width) > abs(g.translation.height) * 1.2 else { return }
                let dx = g.translation.width
                svep = dx * 0.85
            }
            .onEnded { g in
                let dx = g.translation.width
                let fart = g.predictedEndTranslation.width
                let steg = (dx < -70 || fart < -180) ? 1 : ((dx > 70 || fart > 180) ? -1 : 0)
                if steg != 0, abs(dx) > abs(g.translation.height), skal.bytFlik(steg) {
                    // Den nya flikens adress kommer in från andra sidan.
                    utanRorelse { svep = CGFloat(steg) * 90 }
                    withAnimation(Rorelse.val(Rorelse.snabbFjader, minska)) { svep = 0 }
                } else {
                    withAnimation(Rorelse.val(Rorelse.snabbFjader, minska)) { svep = 0 }
                }
            }
    }

    private func visaFaltval() {
        var val: [Snabbval] = []
        if let u = flik?.url, !arTomAdress(u) {
            val.append(Snabbval(titel: tr("Kopiera länk"), ikon: .kopiera) { skal.kopieraLank() })
        }
        if UIPasteboard.general.hasStrings || UIPasteboard.general.hasURLs {
            val.append(Snabbval(titel: tr("Klistra in och gå"), ikon: .klistra) { skal.klistraInOchGa() })
        }
        if let u = flik?.url, !arTomAdress(u) {
            val.append(Snabbval(titel: tr("Dela"), ikon: .dela) { skal.dela() })
        }
        guard !val.isEmpty else { return }
        Haptik.medel()
        skal.snabbmeny = Snabbmeny(rubrik: nil, val: val, ankare: skal.adressram)
    }
}

/// Domänen (och dämpad resten av adressen), eller platshållaren i en tom flik.
struct Adresstext: View {
    let flik: (any Flik)?
    let farger: Skalfarger
    var storlek: CGFloat = 16

    @Environment(AppMiljo.self) private var app

    var body: some View {
        let url = visadAdress(flik)
        if arTomAdress(url) {
            Text(flik?.privat == true ? tr("Sök privat eller skriv en adress") : tr("Sök tryggt eller skriv en adress"))
                .grotesk(storlek, vikt: 450, tak: 24)
                .foregroundStyle(farger.dampad)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        } else {
            let visning = Webbadress.visning(url, installningar: app.installningar)
            let (vard, rest) = Self.dela(visning)
            HStack(spacing: 5) {
                if let ikon = Self.sakerhetsikon(flik) {
                    Ikonvy(ikon.0, storlek: storlek * 0.8, streck: 2)
                        .foregroundStyle(ikon.1 ? farger.dampad : Color.hex("#cf9128"))
                }
                (Text(vard).foregroundStyle(farger.text) + Text(rest).foregroundStyle(farger.dampad))
                    .grotesk(storlek, vikt: 560, tak: 24)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 2)
        }
    }

    /// "exempel.se/sida" → ("exempel.se", "/sida").
    static func dela(_ s: String) -> (String, String) {
        guard let i = s.firstIndex(where: { $0 == "/" || $0 == "?" }) else { return (s, "") }
        return (String(s[..<i]), String(s[i...]))
    }

    /// Hänglås för säkra sidor, varning för okrypterade (utom den egna datorn).
    static func sakerhetsikon(_ flik: (any Flik)?) -> (Ikon, Bool)? {
        guard let f = flik, let u = f.url, let s = u.scheme?.lowercased() else { return nil }
        if s == "https" { return f.sakerAnslutning ? (.las, true) : (.info, false) }
        if s == "http" {
            let v = u.host(percentEncoded: false) ?? ""
            if v == "localhost" || v == "127.0.0.1" || v == "::1" { return nil }
            return (.info, false)
        }
        return nil
    }
}

/// Skölden till vänster i fältet. Har skyddet stoppat något på sidan visas gorillan med antalet; annars en
/// sköld som visar läget. Tryck för skyddsarket.
struct Skoldchip: View {
    let flik: (any Flik)?
    let skal: SkalLage
    let farger: Skalfarger

    @Environment(AppMiljo.self) private var app
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let antal = skal.provBlockerade ?? flik.flatMap { app.skydd.antalBlockerade(i: $0.id) }
        let vard = visadAdress(flik)?.host(percentEncoded: false) ?? ""
        let pausat = !vard.isEmpty && app.skydd.arPausat(for: vard)
        let lage = app.skydd.lage
        let s = Skrift.faktor(typ, tak: 1.25)
        Button { skal.ark = .skydd } label: {
            Group {
                if let antal, antal > 0, !pausat {
                    HStack(spacing: 4) {
                        Image("SkalGorilla")
                            .resizable()
                            .interpolation(.high)
                            .frame(width: 17 * s, height: 17 * s)
                        Text(antal > 999 ? "999+" : antal.formatted())
                            .font(Font(Typsnitt.familjen(12.5 * s, vikt: 700)).monospacedDigit())
                            .foregroundStyle(farger.accentText)
                    }
                    .padding(.leading, 3)
                    .padding(.trailing, 7)
                    .frame(height: 24 * s)
                    .background(Capsule().fill(farger.accentMjuk))
                } else {
                    Ikonvy(ikon(lage: lage, pausat: pausat), storlek: 19 * s, streck: 1.9)
                        .foregroundStyle(farg(lage: lage, pausat: pausat))
                        .frame(width: 24 * s, height: 24 * s)
                }
            }
            .frame(minWidth: 36, minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(Tryckstil(skala: 0.92))
        .accessibilityLabel(etikett(antal: antal, lage: lage, pausat: pausat))
    }

    private func ikon(lage: Skyddslage, pausat: Bool) -> Ikon {
        if pausat { return .skoldAv }
        switch lage {
        case .av: return .skoldAv
        case .laddar: return .skoldSok
        case .klart: return .skoldKoll
        case .fel: return .skoldVarning
        }
    }

    private func farg(lage: Skyddslage, pausat: Bool) -> Color {
        if pausat { return Color.hex("#cf9128") }
        switch lage {
        case .av: return farger.svag
        case .laddar: return farger.dampad
        case .klart: return farger.accentText
        case .fel: return Color.hex("#d64b45")
        }
    }

    private func etikett(antal: Int?, lage: Skyddslage, pausat: Bool) -> String {
        if pausat { return tr("Skyddet är pausat på den här sajten") }
        if let antal, antal > 0 { return trAntal(antal, en: "{n} annons eller spårare stoppad", flera: "{n} annonser och spårare stoppade") }
        return tr(lage.etikett)
    }
}

/// Ladda om, eller stoppa medan sidan laddar.
struct Laddaknapp: View {
    let flik: (any Flik)?
    let farger: Skalfarger
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let laddar = flik?.laddar ?? false
        let tom = arTomAdress(visadAdress(flik)) && !laddar
        let s = Skrift.faktor(typ, tak: 1.25)
        Button {
            guard let f = flik else { return }
            if f.laddar { f.stoppa() } else if f.url == nil, let u = visadAdress(f) { f.ladda(u) } else { f.laddaOm() }
        } label: {
            Ikonvy(laddar ? .stang : .laddaOm, storlek: (laddar ? 17 : 18) * s, streck: 2)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
                .contentTransition(.opacity)
        }
        .buttonStyle(Vatskeknapp(.ikon, radie: 10, privat: farger.privat))
        .opacity(tom ? 0 : 1)
        .disabled(tom)
        .accessibilityLabel(laddar ? tr("Stoppa") : tr("Läs in igen"))
    }
}

/// Den tunna accentlinjen längst ner i fältet medan sidan laddar (skalas, animeras inte i bredd).
struct Laddlinje: View {
    let flik: (any Flik)?
    let farg: Color
    @State private var synlig = false
    @State private var andel: Double = 0

    var body: some View {
        let laddar = flik?.laddar ?? false
        let framsteg = flik?.framsteg ?? 0
        Rectangle()
            .fill(farg)
            .frame(height: 2.5)
            .scaleEffect(x: max(0.02, andel), y: 1, anchor: .leading)
            .opacity(synlig ? 1 : 0)
            .onChange(of: framsteg, initial: true) { _, ny in
                withAnimation(.easeOut(duration: 0.25)) { andel = laddar ? max(0.08, ny) : andel }
            }
            .onChange(of: laddar, initial: true) { _, nu in
                if nu {
                    utanRorelse { andel = 0.02 }
                    withAnimation(.easeOut(duration: 0.15)) { synlig = true }
                    withAnimation(.easeOut(duration: 0.25)) { andel = max(0.08, framsteg) }
                } else {
                    withAnimation(.easeOut(duration: 0.2)) { andel = 1 }
                    withAnimation(.easeOut(duration: 0.3).delay(0.25)) { synlig = false }
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Den ihopfällda raden: bara domänen, liten. Tryck för att fälla ut.
struct KompaktAdress: View {
    let flik: (any Flik)?
    let skal: SkalLage
    let farger: Skalfarger

    var body: some View {
        Button { skal.expandera() } label: {
            HStack(spacing: 5) {
                if let ikon = Adresstext.sakerhetsikon(flik) {
                    Ikonvy(ikon.0, storlek: 11, streck: 2.2)
                        .foregroundStyle(ikon.1 ? farger.dampad : Color.hex("#cf9128"))
                }
                Text(arTomAdress(visadAdress(flik)) ? tr("Ny flik") : domanFor(visadAdress(flik)))
                    .grotesk(13, vikt: 620, tak: 18)
                    .foregroundStyle(farger.text)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 26)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tr("Visa verktygsraden"))
    }
}

// MARK: - Skriva

/// Fältet när man skriver: ett riktigt UITextField (webbsökningstangentbord, Gå, ingen autokorrigering) med
/// Safaris tysta komplettering, en rensa-knapp och Avbryt.
struct Redigeringsfalt: View {
    let skal: SkalLage
    let farger: Skalfarger

    @Environment(Tema.self) private var tema
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let hojd = tema.matt.adressfalt * Skrift.faktor(typ, tak: 1.3)
        let radie = min(tema.radier.falt, hojd / 2)
        let form = RoundedRectangle(cornerRadius: radie, style: .continuous)
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Ikonvy(skal.arPrivat ? .privat : .sok, storlek: 18, streck: 2)
                    .foregroundStyle(skal.arPrivat ? farger.accentText : farger.dampad)
                    .padding(.leading, 12)
                Adressinmatning(skal: skal, farger: farger, storlek: Skrift.skalad(17, stil: .body, typ: typ, tak: 26),
                                val: tema.typsnittsval)
                    .frame(maxWidth: .infinity)
                if !skal.text.isEmpty {
                    Button { skal.skriv("") } label: {
                        ZStack {
                            Circle().fill(farger.dampad.opacity(0.22))
                            Ikonvy(.stang, storlek: 11, streck: 2.6).foregroundStyle(farger.dampad)
                        }
                        .frame(width: 22, height: 22)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(tr("Rensa"))
                    .transition(.opacity)
                }
            }
            .frame(height: hojd)
            .background { form.fill(farger.falt) }
            .overlay { form.strokeBorder(farger.accent.opacity(0.75), lineWidth: 1.5) }

            Button { skal.avbrytRedigering() } label: {
                Text(tr("Avbryt"))
                    .grotesk(16, vikt: 600, tak: 24)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 8)
                    .frame(minHeight: 40)
            }
            .buttonStyle(Vatskeknapp(.lank, radie: 10, privat: farger.privat))
        }
    }
}

/// UITextField i SwiftUI, med den tysta kompletteringen markerad efter det man skrivit.
struct Adressinmatning: UIViewRepresentable {
    let skal: SkalLage
    let farger: Skalfarger
    let storlek: CGFloat
    let val: Typsnittsval

    func makeCoordinator() -> Koordinator { Koordinator(skal: skal) }

    func makeUIView(context: Context) -> UITextField {
        let f = UITextField()
        f.delegate = context.coordinator
        f.keyboardType = .webSearch
        f.returnKeyType = .go
        f.autocorrectionType = .no
        f.autocapitalizationType = .none
        f.spellCheckingType = .no
        f.smartQuotesType = .no
        f.smartDashesType = .no
        f.smartInsertDeleteType = .no
        f.textContentType = .URL
        f.clearButtonMode = .never
        f.enablesReturnKeyAutomatically = true
        f.adjustsFontForContentSizeCategory = false
        f.accessibilityIdentifier = "adressinmatning"
        f.addTarget(context.coordinator, action: #selector(Koordinator.andrad(_:)), for: .editingChanged)
        f.setContentHuggingPriority(.defaultLow, for: .horizontal)
        f.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return f
    }

    func updateUIView(_ f: UITextField, context: Context) {
        let k = context.coordinator
        f.font = Skrift.textUI(storlek, vikt: 450, val: val)
        f.textColor = UIColor(farger.text)
        f.tintColor = UIColor(farger.accent)
        f.attributedPlaceholder = NSAttributedString(
            string: skal.arPrivat ? tr("Sök privat eller skriv en adress") : tr("Sök tryggt eller skriv en adress"),
            attributes: [.foregroundColor: UIColor(farger.dampad), .font: Skrift.textUI(storlek, vikt: 450, val: val)])
        if k.skrivet != skal.text {
            // Ändrat utifrån (fältet öppnades, rensades eller självtestet skrev).
            k.skrivet = skal.text
            k.visa(f, skal.text, komplettera: !skal.orord)
        }
        if skal.redigerar, !k.fokuserad {
            k.fokuserad = true
            efter(0) {
                f.becomeFirstResponder()
                if !(f.text ?? "").isEmpty { f.selectAll(nil) }
            }
        } else if !skal.redigerar, k.fokuserad {
            k.fokuserad = false
            if f.isFirstResponder { f.resignFirstResponder() }
        }
    }

    @MainActor
    final class Koordinator: NSObject, UITextFieldDelegate {
        let skal: SkalLage
        /// Det användaren har skrivit (utan kompletteringen).
        var skrivet = ""
        /// Kompletteringen som visas markerad efter det skrivna.
        var komplettering: String?
        var fokuserad = false
        private var sattTextSjalv = false

        init(skal: SkalLage) { self.skal = skal }

        func visa(_ f: UITextField, _ text: String, komplettera: Bool) {
            sattTextSjalv = true
            defer { sattTextSjalv = false }
            if komplettera, let k = skal.forslag.komplettering, !k.isEmpty {
                komplettering = k
                f.text = text + k
                let start = (text as NSString).length
                if let a = f.position(from: f.beginningOfDocument, offset: start),
                   let b = f.position(from: a, offset: (k as NSString).length) {
                    f.selectedTextRange = f.textRange(from: a, to: b)
                }
            } else {
                komplettering = nil
                f.text = text
            }
        }

        func textField(_ f: UITextField, shouldChangeCharactersIn range: NSRange, replacementString s: String) -> Bool {
            guard f.markedTextRange == nil, !s.contains("\n") else { return true }
            let nu = (f.text ?? "") as NSString
            let skrivetLangd = (skrivet as NSString).length
            // Ersätter man den markerade kompletteringen skriver man vidare på det skrivna.
            if let k = komplettering, range.location == skrivetLangd, range.length == (k as NSString).length {
                if s.isEmpty {
                    komplettering = nil
                    sattTextSjalv = true
                    f.text = skrivet
                    sattTextSjalv = false
                    return false
                }
                skriv(f, skrivet + s, raderade: false, markor: skrivetLangd + (s as NSString).length)
                return false
            }
            let ny = nu.replacingCharacters(in: range, with: s)
            let iSlutet = range.location + range.length >= nu.length
            skriv(f, ny, raderade: s.isEmpty || !iSlutet, markor: range.location + (s as NSString).length)
            return false
        }

        private func skriv(_ f: UITextField, _ ny: String, raderade: Bool, markor: Int) {
            skrivet = ny
            skal.skriv(ny)
            if raderade {
                sattTextSjalv = true
                komplettering = nil
                f.text = ny
                if let p = f.position(from: f.beginningOfDocument, offset: markor) { f.selectedTextRange = f.textRange(from: p, to: p) }
                sattTextSjalv = false
            } else {
                visa(f, ny, komplettera: true)
            }
        }

        @objc func andrad(_ f: UITextField) {
            guard !sattTextSjalv, f.markedTextRange == nil else { return }
            skrivet = f.text ?? ""
            komplettering = nil
            skal.skriv(skrivet)
        }

        func textFieldDidChangeSelection(_ f: UITextField) {
            guard !sattTextSjalv, let k = komplettering, let sel = f.selectedTextRange else { return }
            let start = f.offset(from: f.beginningOfDocument, to: sel.start)
            let langd = f.offset(from: sel.start, to: sel.end)
            if start != (skrivet as NSString).length || langd != (k as NSString).length {
                // Markören flyttades: kompletteringen blir en del av texten.
                komplettering = nil
                skrivet = f.text ?? ""
                skal.skriv(skrivet)
            }
        }

        func textFieldShouldReturn(_ f: UITextField) -> Bool {
            skal.ga(f.text ?? "")
            return false
        }
    }
}
