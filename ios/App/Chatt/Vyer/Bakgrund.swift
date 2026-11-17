import PhotosUI
import SwiftUI

/// Bakgrunden per chatt (plan 3, 4.4): papper (förval), gorillamönster i temats färger, toningar i accenten,
/// enfärgat, eller en egen bild från bildväljaren med dämpning i mörkt läge och oskärpa.
/// Sparas per chatt på telefonen. Synk till datorn kräver en ny serverrutt (se rapporten).
enum ChattBakgrundsforval: String, CaseIterable, Identifiable {
    case papper, gorilla, glod, skymning, sand, natt, egen
    var id: String { rawValue }

    @MainActor var namn: String {
        switch self {
        case .papper: return ct("Papper")
        case .gorilla: return ct("Gorillor")
        case .glod: return ct("Glöd")
        case .skymning: return ct("Skymning")
        case .sand: return ct("Sand")
        case .natt: return ct("Natt")
        case .egen: return ct("Egen bild")
        }
    }
}

struct ChattBakgrundsvy: View {
    let konv: KonvId
    let lage: ChattLage
    var forhand: ChattInstallningar.Bakgrund?
    @Environment(Tema.self) private var tema
    @Environment(\.colorScheme) private var schema

    var body: some View {
        let b = forhand ?? lage.installningar.bakgrund(konv)
        ChattBakgrundsyta(forval: ChattBakgrundsforval(rawValue: b.forval) ?? .papper, dampa: b.dampa, oskarpa: b.oskarpa,
                     egen: lage.installningar.egenBild(konv))
            .ignoresSafeArea()
    }
}

struct ChattBakgrundsyta: View {
    let forval: ChattBakgrundsforval
    var dampa: Double = 0.35
    var oskarpa = false
    var egen: URL?
    var monsterstorlek: CGFloat = 30
    @Environment(Tema.self) private var tema
    @Environment(\.colorScheme) private var schema

    private var mork: Bool { schema == .dark }

    var body: some View {
        ZStack {
            switch forval {
            case .papper:
                tema.bakgrund
            case .gorilla:
                tema.bakgrund
                ChattGorillamonster(storlek: monsterstorlek).opacity(mork ? 0.16 : 0.13)
            case .glod:
                LinearGradient(colors: mork ? [Color(chattHex: "#3a1a10"), Color(chattHex: "#161210")] : [Color(chattHex: "#ffe0d2"), Color(chattHex: "#fbf3ec")],
                               startPoint: .topTrailing, endPoint: .bottomLeading)
                RadialGradient(colors: [tema.accent.opacity(mork ? 0.22 : 0.16), .clear], center: .bottomTrailing, startRadius: 10, endRadius: 520)
            case .skymning:
                LinearGradient(colors: mork ? [Color(chattHex: "#1d1730"), Color(chattHex: "#3b1d22"), Color(chattHex: "#151212")]
                                            : [Color(chattHex: "#e9e2f6"), Color(chattHex: "#fbe0d6"), Color(chattHex: "#fbf6f0")],
                               startPoint: .top, endPoint: .bottom)
            case .sand:
                mork ? Color(chattHex: "#24201b") : Color(chattHex: "#efe5d6")
            case .natt:
                mork ? Color(chattHex: "#0d0d0f") : Color(chattHex: "#2a2724")
            case .egen:
                if let egen, let ui = UIImage(contentsOfFile: egen.path) {
                    GeometryReader { g in
                        Image(uiImage: ui).resizable().scaledToFill()
                            .frame(width: g.size.width, height: g.size.height).clipped()
                            .blur(radius: oskarpa ? 18 : 0)
                    }
                    Color.black.opacity(mork ? dampa : dampa * 0.25)
                } else {
                    tema.bakgrund
                }
            }
        }
    }
}

/// Gorillan (appens märke) som ett glest mönster, tonad i accenten.
struct ChattGorillamonster: View {
    var storlek: CGFloat = 30
    @Environment(Tema.self) private var tema
    var body: some View {
        Canvas { ctx, size in
            let symboler = (0..<3).compactMap { ctx.resolveSymbol(id: $0) }
            guard symboler.count == 3 else { return }
            let steg = storlek * 2.6
            var rad = 0
            var y = steg * 0.45
            while y < size.height + steg {
                var x = rad % 2 == 0 ? steg * 0.4 : steg * 0.4 + steg / 2
                var kol = 0
                while x < size.width + steg {
                    // Tre lutningar i ett fast mönster, så att det ser handplacerat ut men är samma varje gång.
                    ctx.draw(symboler[(rad * 2 + kol) % 3], at: CGPoint(x: x, y: y))
                    x += steg
                    kol += 1
                }
                y += steg * 0.8
                rad += 1
            }
        } symbols: {
            ForEach(0..<3, id: \.self) { i in
                Image("ChattGorillaLinje").renderingMode(.template).resizable().scaledToFit()
                    .foregroundStyle(tema.accent)
                    .frame(width: storlek, height: storlek)
                    .rotationEffect(.degrees([-14, 8, -3][i]))
                    .tag(i)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Välj bakgrund: förhandsvisning med två bubblor, rutor med förvalen, egen bild, dämpning och oskärpa.
struct ChattBakgrundsval: View {
    let konv: KonvId
    let lage: ChattLage
    @Environment(Tema.self) private var tema
    @Environment(\.colorScheme) private var schema
    @State private var bakgrund = ChattInstallningar.Bakgrund(forval: "papper")
    @State private var val: PhotosPickerItem?
    @State private var laddar = false

    private var forval: ChattBakgrundsforval { ChattBakgrundsforval(rawValue: bakgrund.forval) ?? .papper }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                forhandsvisning
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 14) {
                    ForEach(ChattBakgrundsforval.allCases.filter { $0 != .egen }) { f in ruta(f) }
                    egenRuta
                }
                if forval == .egen {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(ct("Dämpa i mörkt läge")).font(Typsnitt.grotesk(15, vikt: 600, relativTill: .subheadline)).foregroundStyle(tema.text)
                            Slider(value: $bakgrund.dampa, in: 0...0.8) { _ in spara() }
                                .tint(tema.accent)
                        }
                        Toggle(isOn: Binding(get: { bakgrund.oskarpa }, set: { bakgrund.oskarpa = $0; spara() })) {
                            Text(ct("Oskärpa")).font(Typsnitt.grotesk(15, vikt: 600, relativTill: .subheadline)).foregroundStyle(tema.text)
                        }
                        .tint(tema.accent)
                    }
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tema.yta))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                }
                Text(ct("Bakgrunden sparas på den här telefonen och gäller bara den här chatten."))
                    .font(Typsnitt.grotesk(13.5, relativTill: .footnote)).foregroundStyle(tema.dampad)
            }
            .padding(20)
        }
        .background(tema.bakgrund)
        .navigationTitle(ct("Bakgrund"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { bakgrund = lage.installningar.bakgrund(konv) }
        .onChange(of: val) { _, ny in if let ny { Task { await egenBild(ny) } } }
    }

    private var forhandsvisning: some View {
        ZStack {
            ChattBakgrundsyta(forval: forval, dampa: bakgrund.dampa, oskarpa: bakgrund.oskarpa, egen: lage.installningar.egenBild(konv))
            VStack(spacing: 8) {
                HStack {
                    Text(ct("Har du sett den nya kartan?"))
                        .font(Typsnitt.grotesk(15.5)).foregroundStyle(tema.text)
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tema.bubblaDeras))
                    Spacer()
                }
                HStack {
                    Spacer()
                    Text(ct("Ja! Den är så fin 🧡"))
                        .font(Typsnitt.grotesk(15.5)).foregroundStyle(tema[.paAccent])
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tema.bubblaMin))
                }
            }
            .padding(16)
        }
        .frame(height: 210)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
        .animation(.easeInOut(duration: 0.25), value: bakgrund)
    }

    private func ruta(_ f: ChattBakgrundsforval) -> some View {
        Button {
            ChattHaptik.val()
            bakgrund.forval = f.rawValue
            spara()
        } label: {
            VStack(spacing: 7) {
                ChattBakgrundsyta(forval: f, monsterstorlek: 14)
                    .frame(height: 118)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(forval == f ? tema.accent : tema.linje, lineWidth: forval == f ? 2.5 : 1))
                    .overlay(alignment: .bottomTrailing) {
                        if forval == f {
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(tema[.paAccent])
                                .frame(width: 22, height: 22).background(Circle().fill(tema.accent)).padding(7)
                        }
                    }
                Text(f.namn).font(Typsnitt.grotesk(13, vikt: forval == f ? 650 : 500, relativTill: .footnote))
                    .foregroundStyle(forval == f ? tema.text : tema.dampad)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(forval == f ? .isSelected : [])
    }

    private var egenRuta: some View {
        // Bildväljarens etikett ritas utanför huvudaktören: allt från temat räknas ut här först.
        let vald = forval == .egen
        let ui = lage.installningar.egenBild(konv).flatMap { UIImage(contentsOfFile: $0.path) }
        let yta2 = tema[.yta2], dampad = tema.dampad, accent = tema.accent, linje = tema.linje, text = tema.text
        let font = Typsnitt.grotesk(13, vikt: vald ? 650 : 500, relativTill: .footnote)
        let namn = ChattBakgrundsforval.egen.namn
        let laddar = self.laddar
        return PhotosPicker(selection: $val, matching: .images) {
            VStack(spacing: 7) {
                ZStack {
                    if let ui {
                        Image(uiImage: ui).resizable().scaledToFill()
                    } else {
                        yta2
                        if laddar { ProgressView().tint(dampad) } else {
                            Image(systemName: "photo.badge.plus").font(.system(size: 22, weight: .medium)).foregroundStyle(dampad)
                        }
                    }
                }
                .frame(height: 118).frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(vald ? accent : linje, lineWidth: vald ? 2.5 : 1))
                Text(namn).font(font).foregroundStyle(vald ? text : dampad)
            }
        }
        .buttonStyle(.plain)
    }

    private func spara() { lage.installningar.sattBakgrund(konv, bakgrund) }

    private func egenBild(_ item: PhotosPickerItem) async {
        laddar = true
        defer { laddar = false; val = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let ui = UIImage(data: data),
              let mal = lage.installningar.egenBild(konv),
              let jpeg = ChattMedia.skala(ui, 2000).jpegData(compressionQuality: 0.85) else {
            lage.notis = ct("Kunde inte läsa bilden.")
            return
        }
        do {
            try jpeg.write(to: mal, options: .atomic)
            bakgrund.forval = ChattBakgrundsforval.egen.rawValue
            spara()
        } catch { lage.notis = ct("Kunde inte spara bilden.") }
    }
}

extension Color {
    init(chattHex hex: String) { self.init(uiColor: UIColor(hex: hex)) }
}
