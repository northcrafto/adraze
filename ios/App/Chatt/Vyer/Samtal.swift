import SwiftUI

/// Samtalsskärmen som förberedelse (plan 3, 4.5; samtal byggs i steg 7). Den låtsas inte ringa: ingen
/// "Ringer…", inga pulserande ringar och knapparna är avstängda. Den säger rakt ut att samtal inte finns
/// på telefonen än och att man kan ringa från datorn.
struct ChattSamtalsskarm: View {
    let lage: ChattLage
    let konv: KonvId
    @Environment(\.dismiss) private var stang

    private var namn: String { lage.namn(konv) }
    private var ton: Color {
        Color(uiColor: UIColor(hex: ChattAvatarton.morka[ChattAvatarton.index(namn)]))
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [ton, Color(uiColor: UIColor(hex: "#0f0d0c"))], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer(minLength: 40)
                Group {
                    if konv.sort == .grupp {
                        ChattGruppavatar(namn: namn, bild: lage.grupp(konv.id)?.avatar, medlemmar: lage.medlemsnamn[konv.id] ?? [], storlek: 128)
                    } else {
                        ChattAvatar(namn: namn, bild: lage.person(konv.id)?.avatar, storlek: 128)
                    }
                }
                .overlay(Circle().strokeBorder(.white.opacity(0.14), lineWidth: 1).padding(-14))
                Text(namn).font(Typsnitt.rubrik(32, vikt: 600)).foregroundStyle(.white).padding(.top, 34)
                Text(ct("Samtal finns inte på telefonen än"))
                    .font(Typsnitt.grotesk(17, vikt: 600, relativTill: .headline)).foregroundStyle(.white.opacity(0.92)).padding(.top, 12)
                Text(ct("Ring från AdRaze på datorn så länge. Samtal i appen kommer i en senare version."))
                    .font(Typsnitt.grotesk(15, relativTill: .subheadline)).foregroundStyle(.white.opacity(0.66))
                    .multilineTextAlignment(.center).lineSpacing(2).padding(.top, 6).frame(maxWidth: 300)
                Spacer()
                HStack(spacing: 0) {
                    ChattSamtalsknapp(ikon: "mic.slash.fill", text: ct("Ljud av"))
                    ChattSamtalsknapp(ikon: "speaker.wave.2.fill", text: ct("Högtalare"))
                    ChattSamtalsknapp(ikon: "video.fill", text: ct("Video"))
                    VStack(spacing: 8) {
                        Button { stang() } label: {
                            Image(systemName: "xmark").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                                .frame(width: 70, height: 70).background(Circle().fill(Color(uiColor: UIColor(hex: "#e5484d"))))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("chatt.samtal.stang")
                        Text(ct("Stäng")).font(Typsnitt.grotesk(12, vikt: 500)).foregroundStyle(.white.opacity(0.85))
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 12).padding(.bottom, 34)
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct ChattSamtalsknapp: View {
    let ikon: String
    let text: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: ikon).font(.system(size: 23, weight: .semibold)).foregroundStyle(.white.opacity(0.5))
                .frame(width: 70, height: 70).background(Circle().fill(.white.opacity(0.08)))
            Text(text).font(Typsnitt.grotesk(12, vikt: 500)).foregroundStyle(.white.opacity(0.45))
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
        .accessibilityHint(ct("Inte tillgänglig än"))
        .accessibilityAddTraits(.isStaticText)
    }
}
