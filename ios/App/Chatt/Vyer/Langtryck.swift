import SwiftUI

/// Valet efter ett långtryck (0,5 s): meddelandet lyfts, allt annat dämpas och blir suddigt, reaktionsraden
/// ovanför och åtgärderna under (plan 3, 4.2). Ritas av `ChattRot` ovanpå allt, även rubriken.
struct ChattLangtrycksval: Identifiable {
    let id = UUID()
    let m: ChattMeddelande
    let konv: KonvId
    let ram: CGRect
    let gor: @MainActor (ChattLangtrycksatgard) -> Void
}

enum ChattLangtrycksatgard {
    case svara, kopiera, vidarebefordra, fast, rapportera, dolj, angra, reagera(String), merEmoji
}

struct ChattLangtryck: View {
    let val: ChattLangtrycksval
    let lage: ChattLage
    let stang: () -> Void

    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.colorScheme) private var schema
    @State private var visad = false
    @State private var over: String?

    static let snabba = ["❤️", "😂", "👍", "😮", "😢", "🔥"]

    private var rader: [(ChattLangtrycksatgard, String, String, Bool)] {
        var r: [(ChattLangtrycksatgard, String, String, Bool)] = []
        let lasbart = val.m.innehall.arMeddelande && val.m.innehall != .olasbar
        if lasbart { r.append((.svara, ct("Svara"), "arrowshape.turn.up.left", false)) }
        if lasbart, !val.m.text.isEmpty { r.append((.kopiera, ct("Kopiera"), "doc.on.doc", false)) }
        if lasbart { r.append((.vidarebefordra, ct("Vidarebefordra"), "arrowshape.turn.up.right", false)) }
        if lasbart {
            let fast = lage.installningar.fastMeddelande(val.konv) == val.m.id
            r.append((.fast, fast ? ct("Lossa") : ct("Fäst"), fast ? "pin.slash" : "pin", false))
        }
        if !val.m.mitt, lasbart { r.append((.rapportera, ct("Rapportera"), "exclamationmark.bubble", false)) }
        r.append((.dolj, ct("Ta bort för mig"), "trash", true))
        if val.m.mitt, val.m.innehall != .borttaget { r.append((.angra, ct("Ångra sändning"), "arrow.uturn.backward.circle", true)) }
        return r
    }

    var body: some View {
        GeometryReader { g in
            let skarm = g.size
            let topp = g.safeAreaInsets.top + 10, botten = skarm.height - g.safeAreaInsets.bottom - 10
            let radH: CGFloat = 46
            let listaH = CGFloat(rader.count) * radH + 12
            let reaktionH: CGFloat = 54
            let bubbelH = min(val.ram.height, skarm.height * 0.42)
            let totalt = reaktionH + 10 + bubbelH + 10 + listaH
            let onskadY = val.ram.minY - reaktionH - 10
            let y0 = min(max(onskadY, topp), max(topp, botten - totalt))
            let flytt = (y0 + reaktionH + 10) - val.ram.minY
            let kant: HorizontalAlignment = val.m.mitt ? .trailing : .leading

            ZStack(alignment: .topLeading) {
                // Dämpad, suddig bakgrund. Tryck utanför stänger.
                Rectangle().fill(.ultraThinMaterial)
                    .overlay(Color.black.opacity(schema == .dark ? 0.35 : 0.16))
                    .opacity(visad ? 1 : 0)
                    .ignoresSafeArea()
                    .onTapGesture(perform: stang)

                VStack(alignment: kant, spacing: 10) {
                    reaktionsrad
                        .scaleEffect(visad ? 1 : 0.6, anchor: val.m.mitt ? .bottomTrailing : .bottomLeading)
                        .opacity(visad ? 1 : 0)
                    ChattBubbla(m: val.m, konv: val.konv, lage: lage, maxBredd: val.ram.width)
                        .frame(width: val.ram.width, height: bubbelH, alignment: val.m.mitt ? .trailing : .leading)
                        .clipped()
                        .scaleEffect(visad && !minska ? 1.03 : 1, anchor: val.m.mitt ? .trailing : .leading)
                        .shadow(color: .black.opacity(visad ? 0.18 : 0), radius: 18, y: 8)
                        .allowsHitTesting(false)
                    atgarder(radH)
                        .scaleEffect(visad ? 1 : 0.7, anchor: val.m.mitt ? .topTrailing : .topLeading)
                        .opacity(visad ? 1 : 0)
                }
                .frame(width: max(val.ram.width, 260), alignment: Alignment(horizontal: kant, vertical: .top))
                .position(x: val.m.mitt ? val.ram.maxX - max(val.ram.width, 260) / 2 : val.ram.minX + max(val.ram.width, 260) / 2,
                          y: (visad ? y0 : val.ram.minY - reaktionH - 10) + totalt / 2)
            }
            .frame(width: skarm.width, height: skarm.height)
            .onAppear { _ = flytt }
        }
        .ignoresSafeArea()
        .onAppear {
            ChattHaptik.medel()
            withAnimation(minska ? .easeOut(duration: 0.15) : .spring(response: 0.4, dampingFraction: 0.78)) { visad = true }
        }
        .accessibilityAddTraits(.isModal)
    }

    private var reaktionsrad: some View {
        HStack(spacing: 8) {
            ForEach(Self.snabba, id: \.self) { e in
                let vald = lage.reaktioner(pa: val.m, i: val.konv).contains { $0.emoji == e && $0.mitt }
                Text(e).font(.system(size: 28))
                    .frame(width: 36, height: 36)
                    .scaleEffect(over == e ? 1.5 : 1, anchor: .bottom)
                    .background(Circle().fill(vald ? tema[.accentMjuk] : .clear).frame(width: 42, height: 42))
                    .animation(.spring(response: 0.25, dampingFraction: 0.6), value: over)
                    .onTapGesture { valj(e) }
                    .accessibilityLabel(e)
                    .accessibilityAddTraits(.isButton)
            }
            Button { val.gor(.merEmoji) } label: {
                Image(systemName: "plus").font(.system(size: 17, weight: .bold)).foregroundStyle(tema.dampad)
                    .frame(width: 36, height: 36).background(Circle().fill(tema[.yta2]))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ct("Fler emojier"))
        }
        .padding(.horizontal, 6).padding(.vertical, 9)
        .background(Capsule().fill(tema.yta).shadow(color: .black.opacity(0.16), radius: 20, y: 8))
        .overlay(Capsule().strokeBorder(tema.linje, lineWidth: 0.5))
        // Glid med fingret över raden: den man är över växer (1,5 gånger) och det knäpper lätt.
        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { v in
                let i = Int((v.location.x - 6) / 44)
                let e = (0..<Self.snabba.count).contains(i) ? Self.snabba[i] : nil
                if e != over { over = e; if e != nil { ChattHaptik.val() } }
            }
            .onEnded { _ in if let e = over { valj(e) }; over = nil })
    }

    private func valj(_ e: String) {
        ChattHaptik.mjuk()
        val.gor(.reagera(e))
    }

    private func atgarder(_ radH: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rader.enumerated()), id: \.offset) { i, r in
                if i > 0, r.3, !rader[i - 1].3 { Rectangle().fill(tema.linje).frame(height: 6).opacity(0.6) }
                Button { val.gor(r.0) } label: {
                    HStack {
                        Text(r.1).font(Typsnitt.grotesk(16, vikt: 500, relativTill: .body))
                        Spacer()
                        Image(systemName: r.2).font(.system(size: 16, weight: .medium))
                    }
                    .foregroundStyle(r.3 ? tema[.fara] : tema.text)
                    .padding(.horizontal, 16).frame(height: radH).contentShape(Rectangle())
                }
                .buttonStyle(ChattAtgardstryck())
                if i < rader.count - 1, !(rader[i + 1].3 && !r.3) { Rectangle().fill(tema.linje).frame(height: 0.5).padding(.leading, 16) }
            }
        }
        .frame(width: 250)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(tema.yta).shadow(color: .black.opacity(0.16), radius: 24, y: 10))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct ChattAtgardstryck: ButtonStyle {
    @Environment(Tema.self) private var tema
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(tema[.yta2].opacity(configuration.isPressed ? 1 : 0))
    }
}

/// Alla emojier (datorns lista i `chatt-emoji.js`, kategorier med sökord) när plusknappen trycks.
struct ChattEmojivaljare: View {
    let valj: (String) -> Void
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var sok = ""

    private static let alla: [(namn: String, e: [(String, String)])] = {
        guard let data = Bunt.data("Webb", "ui/chatt-emoji.js"), let js = String(data: data, encoding: .utf8),
              let start = js.range(of: "const EMOJI_KAT = ")?.upperBound,
              let slut = js.range(of: "];", range: start..<js.endIndex)?.upperBound,
              let lista = try? JSONSerialization.jsonObject(with: Data(js[start..<js.index(before: slut)].utf8)) as? [[String: Any]] else {
            return [("Smileys", ChattLangtryck.snabba.map { ($0, "") })]
        }
        return lista.map { k in (k["namn"] as? String ?? "", ((k["e"] as? [[String]]) ?? []).compactMap { $0.count == 2 ? ($0[0], $0[1]) : nil }) }
    }()

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 6) {
                    ForEach(Array(traffar.enumerated()), id: \.offset) { _, e in
                        Button { valj(e); stang() } label: { Text(e).font(.system(size: 30)).frame(height: 42) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
            }
            .searchable(text: $sok, prompt: ct("Sök emoji"))
            .navigationTitle(ct("Reagera"))
            .navigationBarTitleDisplayMode(.inline)
            .background(tema.bakgrund)
        }
        .presentationDetents([.medium, .large])
    }

    private var traffar: [String] {
        let s = sok.lowercased().trimmingCharacters(in: .whitespaces)
        return Self.alla.flatMap { k in k.e.filter { s.isEmpty || $0.1.contains(s) }.map(\.0) }
    }
}
