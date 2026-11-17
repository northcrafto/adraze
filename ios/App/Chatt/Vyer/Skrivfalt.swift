import AVFoundation
import AVKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Skrivfältet längst ned: plus för bild eller video (PHPicker, ingen behörighet behövs), textfältet som växer
/// upp till sex rader, och en rund orange skicka-knapp som dyker upp när det finns något att skicka.
/// Ovanför: svaret man skriver på och bilagan som ska med.
struct ChattSkrivfalt: View {
    let lage: ChattLage
    let konv: KonvId
    @Binding var svar: ChattMeddelande?

    @Environment(Tema.self) private var tema
    @State private var text = ""
    @State private var val: PhotosPickerItem?
    @State private var bilaga: Bilaga?
    @State private var forbereder = false
    @FocusState private var fokus: Bool

    enum Bilaga {
        case bild(ChattUtkast.Bilddata, UIImage)
        case video(ChattUtkast.Videodata, UIImage?)
    }

    private var tom: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var kanSkicka: Bool { !forbereder && (!tom || bilaga != nil) }

    var body: some View {
        VStack(spacing: 0) {
            if let s = svar { svarsrad(s).transition(.move(edge: .bottom).combined(with: .opacity)) }
            if bilaga != nil || forbereder { bilagerad.transition(.move(edge: .bottom).combined(with: .opacity)) }
            HStack(alignment: .bottom, spacing: 8) {
                PhotosPicker(selection: $val, matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).frame(width: 40, height: 40)
                }
                .buttonStyle(ChattKnapp(.ikon))
                .accessibilityLabel(ct("Bild eller video"))

                TextField("", text: $text, prompt: Text(ct("Meddelande")).foregroundColor(tema[.svag]), axis: .vertical)
                    .font(Typsnitt.grotesk(16.5, relativTill: .body))
                    .lineLimit(1...6)
                    .focused($fokus)
                    .padding(.vertical, 9.5)
                    .padding(.horizontal, 15)
                    .frame(minHeight: 40)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema[.falt]))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(fokus ? tema.accent.opacity(0.55) : tema[.faltlinje], lineWidth: 1))
                    .accessibilityIdentifier("chatt.skriv")
                    .onChange(of: text) { _, ny in if !ny.isEmpty { lage.skriverNu(konv) } }

                if kanSkicka {
                    Button(action: skicka) {
                        Image(systemName: "arrow.up").font(.system(size: 17, weight: .heavy)).frame(width: 40, height: 40)
                    }
                    .buttonStyle(ChattKnapp(.skicka))
                    .accessibilityLabel(ct("Skicka"))
                    .accessibilityIdentifier("chatt.skicka")
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 8)
        }
        .background(alignment: .top) {
            Rectangle().fill(.bar).ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) { Rectangle().fill(tema.linje).frame(height: 0.5) }
        }
        .animation(ChattRorelse.snabb, value: kanSkicka)
        .animation(ChattRorelse.snabb, value: svar?.id)
        .animation(ChattRorelse.snabb, value: forbereder)
        .onChange(of: val) { _, ny in if let ny { Task { await forbered(ny) } } }
        .onChange(of: svar?.id) { _, ny in if ny != nil { fokus = true } }
    }

    // MARK: Svar och bilaga

    private func svarsrad(_ m: ChattMeddelande) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(tema.accent).frame(width: 3, height: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(m.mitt ? ct("Svarar på ditt meddelande") : ct("Svarar {namn}", ["namn": m.franNamn]))
                    .font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).foregroundStyle(tema[.accentText])
                Text(forhand(m)).font(Typsnitt.grotesk(14, relativTill: .footnote)).foregroundStyle(tema.dampad).lineLimit(1)
            }
            Spacer()
            Button { svar = nil } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).frame(width: 30, height: 30)
            }
            .buttonStyle(ChattKnapp(.ikon))
            .accessibilityLabel(ct("Avbryt svaret"))
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 2)
    }

    private func forhand(_ m: ChattMeddelande) -> String {
        switch m.innehall {
        case .bild(_, let t): return t.isEmpty ? "📷 " + ct("Bild") : t
        case .video(_, let t): return t.isEmpty ? "🎬 " + ct("Video") : t
        default: return m.text
        }
    }

    @ViewBuilder private var bilagerad: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tema[.yta2])
                switch bilaga {
                case .bild(_, let ui): Image(uiImage: ui).resizable().scaledToFill()
                case .video(_, let tumme):
                    if let tumme { Image(uiImage: tumme).resizable().scaledToFill() }
                    Image(systemName: "play.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.4), radius: 4)
                case nil: ProgressView().tint(tema.dampad)
                }
            }
            .frame(width: 58, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(rubrikForBilaga).font(Typsnitt.grotesk(14.5, vikt: 600, relativTill: .subheadline)).foregroundStyle(tema.text)
                Text(undertextForBilaga).font(Typsnitt.grotesk(13, relativTill: .footnote)).foregroundStyle(tema.dampad).monospacedDigit()
            }
            Spacer()
            if bilaga != nil {
                Button { bilaga = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).frame(width: 30, height: 30)
                }
                .buttonStyle(ChattKnapp(.ikon))
                .accessibilityLabel(ct("Ta bort bilagan"))
            }
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 2)
    }

    private var rubrikForBilaga: String {
        switch bilaga {
        case .bild: return ct("Bild")
        case .video: return ct("Video")
        case nil: return ct("Förbereder…")
        }
    }

    private var undertextForBilaga: String {
        let mb: (Int) -> String = { String(format: "%.1f MB", Double($0) / 1_000_000) }
        switch bilaga {
        case .bild(let b, _): return "\(b.bredd) × \(b.hojd) · \(mb(b.data.count))"
        case .video(let v, _): return Duration.seconds(v.langd).formatted(.time(pattern: .minuteSecond)) + " · " + mb(v.data.count)
        case nil: return ct("Komprimerar för chatten")
        }
    }

    // MARK: Skicka

    private func skicka() {
        guard kanSkicka else { return }
        var u = ChattUtkast(text: text.trimmingCharacters(in: .whitespacesAndNewlines), bild: nil, video: nil, svar: nil)
        if let s = svar {
            u.svar = ChattCitat(id: s.id, vem: s.mitt ? (lage.jag?.anvandarnamn ?? "") : s.franNamn, text: String(forhand(s).prefix(60)),
                           bild: { if case .bild = s.innehall { return true } else { return false } }())
        }
        switch bilaga {
        case .bild(let b, _): u.bild = b
        case .video(let v, _): u.video = v
        case nil: break
        }
        text = ""
        bilaga = nil
        svar = nil
        let k = konv
        Task { _ = await lage.skicka(k, u) }
    }

    private func forbered(_ item: PhotosPickerItem) async {
        forbereder = true
        defer { forbereder = false; val = nil }
        let arVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        do {
            if arVideo {
                guard let film = try await item.loadTransferable(type: ChattFilmfil.self) else { throw ChattMediafel.lasa }
                defer { try? FileManager.default.removeItem(at: film.url) }
                let (v, tumme, kortad) = try await ChattMedia.video(film.url)
                bilaga = .video(v, tumme)
                if kortad { lage.notis = ct("Videon kortades till {n} s, chattens gräns i dag.", ["n": String(Int(v.langd.rounded()))]) }
            } else {
                guard let data = try await item.loadTransferable(type: Data.self), let ui = UIImage(data: data) else { throw ChattMediafel.lasa }
                guard let b = ChattMedia.bild(ui) else { throw ChattMediafel.forStor }
                bilaga = .bild(b, UIImage(data: b.data) ?? ui)
            }
        } catch {
            ChattHaptik.fel()
            lage.notis = (error as? ChattMediafel)?.text ?? ct("Kunde inte läsa filen.")
        }
    }
}

enum ChattMediafel: Error {
    case lasa, forStor, video
    @MainActor var text: String {
        switch self {
        case .lasa: return ct("Kunde inte läsa filen.")
        case .forStor: return ct("Filen är för stor för chatten.")
        case .video: return ct("Kunde inte göra om videon.")
        }
    }
}

/// En video från bildväljaren, kopierad till en tillfällig fil.
struct ChattFilmfil: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { SentTransferredFile($0.url) } importing: { mottagen in
            let andelse = mottagen.file.pathExtension.isEmpty ? "mov" : mottagen.file.pathExtension
            let mal = FileManager.default.temporaryDirectory.appendingPathComponent("chatt-in-\(UUID().uuidString).\(andelse)")
            try FileManager.default.copyItem(at: mottagen.file, to: mal)
            return ChattFilmfil(url: mal)
        }
    }
}

/// Bilder och videor görs små nog för dagens server: en bilaga får vara högst cirka 1,6 MB (2,2 miljoner tecken
/// base64 efter krypteringen). Bilder skalas till högst 1600 px och JPEG; videor görs om till MP4 och kortas
/// vid gränsen (`fileLengthLimit`).
enum ChattMedia {
    static let grans = 1_500_000

    static func bild(_ ui: UIImage) -> ChattUtkast.Bilddata? {
        var sida: CGFloat = 1600
        for _ in 0..<5 {
            let s = skala(ui, sida)
            for q in [0.82, 0.7, 0.58, 0.46] {
                if let d = s.jpegData(compressionQuality: q), d.count <= grans {
                    return .init(data: d, mime: "image/jpeg", bredd: Int(s.size.width), hojd: Int(s.size.height))
                }
            }
            sida *= 0.75
        }
        return nil
    }

    static func skala(_ ui: UIImage, _ maxSida: CGFloat) -> UIImage {
        let pixlar = CGSize(width: ui.size.width * ui.scale, height: ui.size.height * ui.scale)
        let f = min(1, maxSida / max(pixlar.width, pixlar.height, 1))
        let ny = CGSize(width: max(1, (pixlar.width * f).rounded()), height: max(1, (pixlar.height * f).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: ny, format: format).image { _ in ui.draw(in: CGRect(origin: .zero, size: ny)) }
    }

    /// Returnerar videon, en miniatyr och om den kortades.
    static func video(_ url: URL) async throws -> (ChattUtkast.Videodata, UIImage?, Bool) {
        let kalla = AVURLAsset(url: url)
        let langd = (try? await kalla.load(.duration).seconds) ?? 0
        guard let export = AVAssetExportSession(asset: kalla, presetName: AVAssetExportPresetMediumQuality) else { throw ChattMediafel.video }
        let ut = FileManager.default.temporaryDirectory.appendingPathComponent("chatt-ut-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: ut) }
        export.outputURL = ut
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        export.fileLengthLimit = Int64(grans)
        await export.export()
        guard export.status == .completed else { throw ChattMediafel.video }
        let data = try Data(contentsOf: ut)
        guard data.count <= grans + 120_000 else { throw ChattMediafel.forStor }
        let resultat = AVURLAsset(url: ut)
        let utLangd = (try? await resultat.load(.duration).seconds) ?? langd
        var storlek = CGSize(width: 16, height: 9)
        if let spar = try? await resultat.loadTracks(withMediaType: .video).first,
           let n = try? await spar.load(.naturalSize), let t = try? await spar.load(.preferredTransform) {
            let r = n.applying(t)
            storlek = CGSize(width: abs(r.width), height: abs(r.height))
        }
        let generator = AVAssetImageGenerator(asset: resultat)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 160, height: 160)
        let tumme = (try? await generator.image(at: .zero).image).map { UIImage(cgImage: $0) }
        let v = ChattUtkast.Videodata(data: data, mime: "video/mp4", bredd: Int(storlek.width), hojd: Int(storlek.height),
                                 langd: utLangd, tumnagel: tumme?.jpegData(compressionQuality: 0.55))
        return (v, tumme, langd - utLangd > 0.6)
    }
}

/// Spelar en video ur chatten: bilagorna hämtas, dekrypteras, läggs ihop och spelas från en tillfällig fil.
struct ChattVideospelare: View {
    let info: ChattVideoinfo
    let konv: KonvId
    let lage: ChattLage
    @Environment(\.dismiss) private var stang
    @State private var spelare: AVPlayer?
    @State private var fil: URL?
    @State private var fel = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let spelare {
                VideoPlayer(player: spelare).ignoresSafeArea()
            } else if fel {
                Text(ct("Kunde inte spela videon.")).font(Typsnitt.grotesk(16, vikt: 500)).foregroundStyle(.white.opacity(0.8))
            } else {
                ProgressView().tint(.white)
            }
        }
        .overlay(alignment: .topTrailing) {
            Button { stang() } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 42, height: 42).background(Circle().fill(.white.opacity(0.16)))
            }
            .padding(16)
            .accessibilityLabel(ct("Stäng"))
        }
        .task {
            var data = Data()
            for id in info.bilagor {
                guard let d = await lage.bilagedata(id, i: konv) else { fel = true; return }
                data.append(d)
            }
            let u = FileManager.default.temporaryDirectory.appendingPathComponent("chatt-spela-\(UUID().uuidString).mp4")
            do { try data.write(to: u); fil = u } catch { fel = true; return }
            let p = AVPlayer(url: u)
            spelare = p
            p.play()
        }
        .onDisappear {
            spelare?.pause()
            if let fil { try? FileManager.default.removeItem(at: fil) }
        }
    }
}
