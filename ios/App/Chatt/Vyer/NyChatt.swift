import SwiftUI

/// Nytt meddelande: lägg till en vän med användarnamnet, starta en grupp, eller välj en vän att skriva till.
struct NyChatt: View {
    let lage: ChattLage
    let oppna: (KonvId) -> Void
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var namn = ""
    @State private var svar: String?
    @State private var arbetar = false
    @FocusState private var fokus: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(ct("Lägg till vän")).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).textCase(.uppercase).tracking(0.8)
                            .foregroundStyle(tema.dampad).padding(.leading, 4)
                        HStack(spacing: 10) {
                            HStack(spacing: 6) {
                                Text(verbatim: "@").font(Typsnitt.grotesk(17, vikt: 600)).foregroundStyle(tema[.svag])
                                TextField("", text: $namn, prompt: Text(ct("användarnamn")).foregroundColor(tema[.svag]))
                                    .font(Typsnitt.grotesk(17, vikt: 500))
                                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                                    .focused($fokus).submitLabel(.send).onSubmit { Task { await skicka() } }
                                    .accessibilityIdentifier("chatt.ny.namn")
                            }
                            .padding(.horizontal, 14).frame(height: 50)
                            .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(tema[.falt]))
                            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(fokus ? tema.accent : tema[.faltlinje], lineWidth: fokus ? 1.5 : 1))
                            Button { Task { await skicka() } } label: {
                                Group { if arbetar { ProgressView().tint(tema[.paAccent]) } else { Text(ct("Skicka")) } }
                                    .font(Typsnitt.grotesk(16, vikt: 650)).padding(.horizontal, 18).frame(height: 50)
                            }
                            .buttonStyle(ChattKnapp(.primar))
                            .disabled(namn.trimmingCharacters(in: .whitespaces).count < 3)
                            .allowsHitTesting(!arbetar)
                        }
                        if let svar {
                            Text(svar).font(Typsnitt.grotesk(14.5, vikt: 500)).foregroundStyle(tema.dampad).padding(.leading, 4)
                                .transition(.opacity)
                        }
                    }

                    NavigationLink { ChattNyGrupp(lage: lage, forval: []) { k in stang(); oppna(k) } } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "person.3.fill").font(.system(size: 18, weight: .semibold)).foregroundStyle(tema[.paAccent])
                                .frame(width: 48, height: 48).background(Circle().fill(tema.accent))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ct("Ny grupp")).font(Typsnitt.grotesk(16.5, vikt: 650)).foregroundStyle(tema.text)
                                Text(ct("Chatta med flera vänner samtidigt")).font(Typsnitt.grotesk(14)).foregroundStyle(tema.dampad)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(tema[.svag])
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.yta))
                        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                    }
                    .buttonStyle(.plain)

                    if !lage.kontakter.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ct("Vänner")).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).textCase(.uppercase).tracking(0.8)
                                .foregroundStyle(tema.dampad).padding(.leading, 4).padding(.bottom, 4)
                            ForEach(lage.kontakter.sorted { $0.anvandarnamn.lowercased() < $1.anvandarnamn.lowercased() }) { p in
                                Button { stang(); oppna(KonvId(sort: .dm, id: p.id)) } label: {
                                    HStack(spacing: 12) {
                                        ChattAvatarMedNarvaro(namn: p.anvandarnamn, bild: p.avatar, storlek: 46, online: p.online == true)
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(p.anvandarnamn).font(Typsnitt.grotesk(16, vikt: 600)).foregroundStyle(tema.text)
                                            if let a = ChattTid.aktiv(p.online, p.senastSedd) {
                                                Text(a).font(Typsnitt.grotesk(13.5)).foregroundStyle(p.online == true ? tema[.accentText] : tema.dampad)
                                            }
                                        }
                                        Spacer()
                                    }
                                    .padding(.vertical, 6).contentShape(Rectangle())
                                }
                                .buttonStyle(ChattRadtryck())
                            }
                        }
                    }

                    if !lage.utgaende.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(ct("Väntar på svar")).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).textCase(.uppercase).tracking(0.8)
                                .foregroundStyle(tema.dampad).padding(.leading, 4)
                            ForEach(lage.utgaende) { p in
                                HStack(spacing: 12) {
                                    ChattAvatar(namn: p.anvandarnamn, bild: p.avatar, storlek: 40)
                                    Text(p.anvandarnamn).font(Typsnitt.grotesk(15.5, vikt: 600)).foregroundStyle(tema.text)
                                    Spacer()
                                    Text(ct("Skickad")).font(Typsnitt.grotesk(13.5)).foregroundStyle(tema.dampad)
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(tema.bakgrund)
            .navigationTitle(ct("Nytt meddelande"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(ct("Stäng")) { stang() } } }
            .animation(.easeOut(duration: 0.2), value: svar)
        }
        .adrazeArk()
    }

    private func skicka() async {
        let n = namn.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        guard n.count >= 3, !arbetar else { return }
        arbetar = true
        defer { arbetar = false }
        svar = await lage.laggTillVan(n)
        if svar == ct("Förfrågan skickad.") || svar == ct("Ni är nu vänner.") { namn = ""; ChattHaptik.klart() } else { ChattHaptik.fel() }
    }
}

/// Ny grupp: namn och medlemmar (vänner). Nyckeln skapas på telefonen och delas med medlemmarna som på datorn.
struct ChattNyGrupp: View {
    let lage: ChattLage
    let forval: [ChattPerson]
    let klar: (KonvId) -> Void
    @Environment(Tema.self) private var tema
    @State private var namn = ""
    @State private var valda: Set<String> = []
    @State private var arbetar = false

    var body: some View {
        List {
            Section {
                TextField("", text: $namn, prompt: Text(ct("Gruppens namn")).foregroundColor(tema[.svag]))
                    .font(Typsnitt.grotesk(17, vikt: 500))
                    .accessibilityIdentifier("chatt.grupp.namn")
                    .listRowBackground(tema.yta)
            }
            Section {
                ForEach(lage.kontakter) { p in
                    ChattPersonval(person: p, vald: valda.contains(p.id)) {
                        if valda.contains(p.id) { valda.remove(p.id) } else { valda.insert(p.id) }
                    }
                    .listRowBackground(tema.yta)
                }
            } header: {
                Text(ct("Medlemmar")).font(Typsnitt.grotesk(13, vikt: 650))
            }
        }
        .scrollContentBackground(.hidden)
        .background(tema.bakgrund)
        .navigationTitle(ct("Ny grupp"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button { Task { await skapa() } } label: {
                    if arbetar { ProgressView() } else { Text(ct("Skapa")).font(Typsnitt.grotesk(16, vikt: 650)) }
                }
                .disabled(namn.trimmingCharacters(in: .whitespaces).isEmpty || valda.isEmpty || arbetar)
            }
        }
        .onAppear { if valda.isEmpty { valda = Set(forval.map(\.id)) } }
    }

    private func skapa() async {
        arbetar = true
        defer { arbetar = false }
        let med = lage.kontakter.filter { valda.contains($0.id) }
        if let k = await lage.skapaGrupp(namn.trimmingCharacters(in: .whitespaces), med) {
            ChattHaptik.klart()
            klar(k)
        } else { ChattHaptik.fel() }
    }
}
