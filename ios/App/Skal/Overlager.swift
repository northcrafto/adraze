import SwiftUI
import UIKit

/// Notisen: datorns `toast` (mörk, vit text, 10 pt hörn), poppar upp 8 pt (0,16 s).
///
/// Ägare: Skal.
struct Notisvy: View {
    let notis: Notis

    var body: some View {
        HStack(spacing: 8) {
            if let ikon = notis.ikon { Ikonvy(ikon, storlek: 16, streck: 2.1) }
            Text(notis.text)
                .grotesk(13.5, vikt: 600, tak: 20)
                .lineLimit(2)
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 15)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.hex("#1f1e1b")))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
        .shadow(color: .black.opacity(0.22), radius: 12, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Snabbmenyn vid ett långt tryck: ett kort vid knappen (ovanför i nedre halvan, annars under).
struct Snabbmenyvy: View {
    let meny: Snabbmeny
    let farger: Skalfarger
    let stang: () -> Void

    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var visad = false

    var body: some View {
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            let a = meny.ankare.offsetBy(dx: -o.x, dy: -o.y)
            let bredd = min(300, g.size.width - 24)
            let ovanfor = a.midY > g.size.height / 2
            let x = min(max(12, a.midX - bredd / 2), g.size.width - bredd - 12)
            ZStack(alignment: .topLeading) {
                Color.black.opacity(visad ? 0.16 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture { stang() }
                VStack(spacing: 0) {
                    if ovanfor { Spacer(minLength: 0) }
                    kort
                        .frame(width: bredd)
                        .scaleEffect(visad ? 1 : 0.94, anchor: ovanfor ? .bottom : .top)
                        .offset(y: visad || minska ? 0 : (ovanfor ? 8 : -8))
                        .opacity(visad ? 1 : 0)
                        .padding(.leading, x)
                    if !ovanfor { Spacer(minLength: 0) }
                }
                .padding(.top, ovanfor ? 0 : a.maxY + 8)
                .padding(.bottom, ovanfor ? g.size.height - a.minY + 8 : 0)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .ignoresSafeArea()
        .onAppear { withAnimation(Rorelse.val(Rorelse.pop, minska)) { visad = true } }
    }

    private var kort: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let rubrik = meny.rubrik {
                Text(rubrik)
                    .grotesk(11.5, vikt: 650, tak: 16)
                    .textCase(.uppercase)
                    .tracking(0.7)
                    .foregroundStyle(farger.dampad)
                    .padding(.horizontal, 14)
                    .padding(.top, 12)
                    .padding(.bottom, 4)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(meny.val) { v in
                        Button {
                            stang()
                            v.gor()
                        } label: {
                            HStack(spacing: 11) {
                                if let m = v.monogram { Monogram(doman: m, storlek: 24) }
                                else if let ikon = v.ikon { Ikonvy(ikon, storlek: 19, streck: 1.9).frame(width: 24) }
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(v.titel)
                                        .grotesk(15, vikt: 560, tak: 22)
                                        .lineLimit(1)
                                    if let u = v.undertitel, !u.isEmpty, u != v.titel {
                                        Text(u)
                                            .grotesk(12, tak: 17)
                                            .foregroundStyle(farger.dampad)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(v.farlig ? Color.hex("#d64b45") : farger.text)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(Radtryck(farg: farger.accentMjuk))
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: 420)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(farger.falt))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(farger.linje))
        .shadow(color: .black.opacity(0.16), radius: 22, y: 8)
    }
}

/// Rader som lyser upp i accentens mjuka ton när man trycker.
struct Radtryck: ButtonStyle {
    let farg: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? farg : Color.clear)
    }
}
