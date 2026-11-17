import SwiftUI

/// En meddelandebubbla i AdRazes stil: mina i djup orange med vit text, andras i varmt papper. Hörnen mot
/// grannarna i samma grupp blir små (6 pt), som på datorn. Tiden ligger nere i hörnet inne i bubblan.
struct ChattBubbla: View {
    let m: ChattMeddelande
    let konv: KonvId
    let lage: ChattLage
    var forstIGrupp = true
    var sistIGrupp = true
    var maxBredd: CGFloat = 290

    @Environment(Tema.self) private var tema

    private var stor: CGFloat { 20 }
    private var liten: CGFloat { 6 }

    var body: some View {
        Group {
            switch m.innehall {
            case .borttaget: borttaget
            case .olasbar: olasbar
            case .bild(let info, let text): bild(info, text)
            case .video(let info, let text): video(info, text)
            default:
                if ChattBubbla.barEmoji(m.text) { jumbo } else { text }
            }
        }
    }

    private var form: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: m.mitt ? stor : (forstIGrupp ? stor : liten),
            bottomLeadingRadius: m.mitt ? stor : (sistIGrupp ? stor : liten),
            bottomTrailingRadius: m.mitt ? (sistIGrupp ? stor : liten) : stor,
            topTrailingRadius: m.mitt ? (forstIGrupp ? stor : liten) : stor,
            style: .continuous)
    }

    private var fargText: Color { m.mitt ? tema[.paAccent] : tema.text }
    private var fargYta: Color { m.mitt ? tema.bubblaMin : tema.bubblaDeras }

    private var tid: some View {
        HStack(spacing: 3) {
            if m.redigerad { Text(ct("ändrat")) }
            Text(ChattTid.klocka(m.tid)).monospacedDigit()
            if m.id.hasPrefix("tmp-") { Image(systemName: "clock").font(.system(size: 9, weight: .semibold)) }
        }
        .font(Typsnitt.grotesk(11, vikt: 500, relativTill: .caption2))
        .foregroundStyle(fargText.opacity(m.mitt ? 0.78 : 0.5))
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let s = m.svar { ChattCitatruta(citat: s, mitt: m.mitt, jag: lage.jag?.anvandarnamn) }
            // Platsen för tiden reserveras med samma text i genomskinligt, så att sista raden inte krockar.
            (Text(m.text) + Text(verbatim: "     " + ChattTid.klocka(m.tid) + (m.redigerad ? "  ·····" : "")).font(Typsnitt.grotesk(11, relativTill: .caption2)).foregroundColor(.clear))
                .font(Typsnitt.grotesk(16.5, relativTill: .body))
                .foregroundStyle(fargText)
                .lineSpacing(1.5)
                .textSelection(.disabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 13).padding(.top, 8.5).padding(.bottom, 9)
        .background(form.fill(fargYta))
        .overlay(alignment: .bottomTrailing) { tid.padding(.trailing, 11).padding(.bottom, 7) }
        .overlay { if !m.mitt { form.strokeBorder(tema.linje.opacity(0.55), lineWidth: 0.5) } }
        .frame(maxWidth: maxBredd, alignment: m.mitt ? .trailing : .leading)
    }

    private var jumbo: some View {
        VStack(alignment: m.mitt ? .trailing : .leading, spacing: 2) {
            Text(m.text).font(.system(size: 44)).fixedSize()
            Text(ChattTid.klocka(m.tid)).monospacedDigit().font(Typsnitt.grotesk(11, vikt: 500, relativTill: .caption2))
                .foregroundStyle(tema[.svag])
        }
    }

    private var borttaget: some View {
        HStack(spacing: 6) {
            Image(systemName: "nosign").font(.system(size: 12, weight: .semibold))
            Text(m.mitt ? ct("Du tog bort meddelandet") : ct("Meddelandet togs bort"))
        }
        .font(Typsnitt.grotesk(14.5, relativTill: .subheadline).italic())
        .foregroundStyle(tema.dampad)
        .padding(.horizontal, 13).padding(.vertical, 9)
        .overlay(form.strokeBorder(tema.linje, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }

    private var olasbar: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.trianglebadge.exclamationmark").font(.system(size: 12, weight: .semibold))
            Text(ct("Kunde inte läsa meddelandet"))
        }
        .font(Typsnitt.grotesk(14.5, relativTill: .subheadline).italic())
        .foregroundStyle(tema.dampad)
        .padding(.horizontal, 13).padding(.vertical, 9)
        .overlay(form.strokeBorder(tema.linje, lineWidth: 1))
    }

    private func storlek(_ b: Int, _ h: Int, max bredd: CGFloat) -> CGSize {
        let w = CGFloat(max(b, 1)), hh = CGFloat(max(h, 1))
        let br = min(bredd, 250)
        return CGSize(width: br, height: min(max(br * hh / w, 110), 330))
    }

    private func bild(_ info: ChattBildinfo, _ text: String) -> some View {
        let s = storlek(info.bredd, info.hojd, max: maxBredd)
        return VStack(alignment: .leading, spacing: 0) {
            if let c = m.svar { ChattCitatruta(citat: c, mitt: m.mitt, jag: lage.jag?.anvandarnamn).padding(8) }
            ChattBildladdare(id: info.bilaga.isEmpty ? m.id : info.bilaga, konv: konv, lage: lage)
                .frame(width: s.width, height: s.height)
                .clipped()
                .overlay(alignment: .bottomTrailing) {
                    if text.isEmpty {
                        tid.foregroundStyle(.white).padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Capsule().fill(.black.opacity(0.35))).padding(8)
                    }
                }
            if !text.isEmpty {
                (Text(text) + Text(verbatim: "     " + ChattTid.klocka(m.tid)).font(Typsnitt.grotesk(11)).foregroundColor(.clear))
                    .font(Typsnitt.grotesk(16.5, relativTill: .body)).foregroundStyle(fargText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .frame(width: s.width, alignment: .leading)
                    .overlay(alignment: .bottomTrailing) { tid.padding(.trailing, 11).padding(.bottom, 7) }
            }
        }
        .background(fargYta)
        .clipShape(form)
        .overlay { form.strokeBorder(tema.linje.opacity(0.5), lineWidth: 0.5) }
    }

    private func video(_ info: ChattVideoinfo, _ text: String) -> some View {
        let s = storlek(info.bredd, info.hojd, max: maxBredd)
        return VStack(alignment: .leading, spacing: 0) {
            ZStack {
                // Miniatyren i meddelandet är liten (datorns format: högst några kB), så den visas medvetet frostad,
                // som en förhandsvisning; videon hämtas och spelas skarp när man trycker.
                if let t = info.tumnagel, let b = UIImage(data: t) {
                    Image(uiImage: b).resizable().scaledToFill().blur(radius: 7, opaque: true)
                        .overlay(Color.black.opacity(0.08))
                } else {
                    tema[.yta2]
                }
                Circle().fill(.ultraThinMaterial).environment(\.colorScheme, .dark).frame(width: 56, height: 56)
                    .overlay(Circle().strokeBorder(.white.opacity(0.22), lineWidth: 1))
                    .overlay(Image(systemName: "play.fill").font(.system(size: 21, weight: .bold)).foregroundStyle(.white).offset(x: 2))
            }
            .frame(width: s.width, height: s.height).clipped()
            .overlay(alignment: .bottomLeading) {
                Text(Duration.seconds(info.langd).formatted(.time(pattern: .minuteSecond)))
                    .font(Typsnitt.grotesk(12, vikt: 600, relativTill: .caption1)).monospacedDigit().foregroundStyle(.white)
                    .padding(.horizontal, 7).padding(.vertical, 3).background(Capsule().fill(.black.opacity(0.4))).padding(8)
            }
            if !text.isEmpty {
                Text(text).font(Typsnitt.grotesk(16.5, relativTill: .body)).foregroundStyle(fargText)
                    .padding(.horizontal, 12).padding(.vertical, 8).frame(width: s.width, alignment: .leading)
            }
        }
        .background(fargYta)
        .clipShape(form)
    }

    static func barEmoji(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, t.count <= 3 else { return false }
        return t.allSatisfy { c in c.unicodeScalars.contains { $0.properties.isEmojiPresentation || ($0.properties.isEmoji && $0.value > 0x238C) } }
    }
}

/// Citatet i ett svar: en orange kant, vem och början av texten.
struct ChattCitatruta: View {
    let citat: ChattCitat
    let mitt: Bool
    /// Mitt användarnamn: ett citat av mig själv visas som "Du" (som på datorn).
    var jag: String? = nil
    @Environment(Tema.self) private var tema
    private var vem: String { citat.vem.isEmpty ? "" : (citat.vem.lowercased() == jag?.lowercased() ? ct("Du") : citat.vem) }
    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(mitt ? Color.white.opacity(0.85) : tema.accent).frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                if !vem.isEmpty {
                    Text(vem).font(Typsnitt.grotesk(12.5, vikt: 700, relativTill: .caption1))
                        .foregroundStyle(mitt ? Color.white.opacity(0.95) : tema[.accentText])
                }
                Text(citat.bild && citat.text.isEmpty ? "📷 " + ct("Bild") : citat.text)
                    .font(Typsnitt.grotesk(13.5, relativTill: .footnote)).lineLimit(2)
                    .foregroundStyle(mitt ? Color.white.opacity(0.85) : tema.dampad)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6).padding(.leading, 7).padding(.trailing, 10)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(mitt ? Color.black.opacity(0.13) : tema.text.opacity(0.055)))
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Hämtar och dekrypterar en bild (en gång; sedan ur minnet).
struct ChattBildladdare: View {
    let id: String
    let konv: KonvId
    let lage: ChattLage
    @State private var bild: UIImage?
    @Environment(Tema.self) private var tema
    var body: some View {
        ZStack {
            if let b = bild ?? lage.bildIMinnet(id) {
                Image(uiImage: b).resizable().scaledToFill()
            } else {
                tema[.yta2].overlay(ProgressView().tint(tema.dampad))
            }
        }
        .task(id: id) {
            if bild == nil { bild = await lage.bild(id, i: konv) }
        }
    }
}

/// Reaktionerna under en bubbla: emoji och antal i små kapslar; min egen har orange kant.
struct ChattReaktionsrad: View {
    let poster: [(emoji: String, vem: [String], mitt: Bool)]
    let mitt: Bool
    let vaxla: (String) -> Void
    var body: some View {
        HStack(spacing: 4) {
            ForEach(poster, id: \.emoji) { p in
                ChattReaktionsbricka(emoji: p.emoji, vem: p.vem, mitt: p.mitt) { vaxla(p.emoji) }
            }
        }
        .transition(.scale(scale: 0.6, anchor: mitt ? .topTrailing : .topLeading).combined(with: .opacity))
    }
}

/// En reaktion: emoji och antal. Min egen fylls med orange vätska bakifrån när den sätts (plan 3, 4.2).
private struct ChattReaktionsbricka: View {
    let emoji: String
    let vem: [String]
    let mitt: Bool
    let vaxla: () -> Void
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var fylld: CGFloat = 0

    var body: some View {
        Button(action: vaxla) {
            HStack(spacing: 3) {
                Text(emoji).font(.system(size: 15))
                if vem.count > 1 {
                    Text(String(vem.count)).font(Typsnitt.grotesk(12.5, vikt: 650, relativTill: .caption1)).monospacedDigit()
                        .foregroundStyle(mitt ? tema[.accentText] : tema.dampad)
                }
            }
            .padding(.horizontal, 7).frame(height: 26)
            .background {
                ZStack {
                    Capsule().fill(tema.yta)
                    ChattVatskelager(niva: fylld, fyllning: tema[.accentMjuk], valvd: !minska).clipShape(Capsule())
                }
            }
            .overlay(Capsule().strokeBorder(mitt ? tema.accent.opacity(0.7) : tema.linje, lineWidth: mitt ? 1.2 : 1))
            .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(emoji) \(vem.joined(separator: ", "))")
        .onAppear { fyll(mitt) }
        .onChange(of: mitt) { _, ny in fyll(ny) }
    }

    private func fyll(_ pa: Bool) {
        withAnimation(minska ? .easeOut(duration: 0.2) : .timingCurve(0.2, 0.75, 0.25, 1, duration: pa ? 0.9 : 0.4)) { fylld = pa ? 1 : 0 }
    }
}
