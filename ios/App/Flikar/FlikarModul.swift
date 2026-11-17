import Foundation
import UIKit

/// Flikar: flikarna med var sin WKWebView, navigering, privata flikar, sovande flikar, historik, bokmärken,
/// nedladdningar, kontextmeny, dialoger och felsidor. Byter `EnkelFlikHanterare` mot `Flikmotor` med
/// `app.ersatt(flikar:)`.
///
/// Andra moduler når allt genom `app.flikar` (protokollen i `Gemensamt/Flik.swift`) och bryggkanalerna i
/// `Flikkanaler` (historik, bokmärken, förslag, nedladdningar, zoom, skrivbordsläge, sök på sidan), aldrig
/// genom klasserna här.
///
/// Ägare: Flikar.
final class FlikarModul: NSObject, AppModul {
    static let namn = "Flikar"
    static let ordning = 20

    static func registrera(i app: AppMiljo) {
        // Självtester (alla -mode, även andras) får en egen tom lagring, så att varje test börjar med en tom flik
        // och aldrig rör de riktiga flikarna, historiken eller bokmärkena.
        let lagring = app.startargument.lage == nil ? Fliklagring.standard() : Fliklagring.forSjalvtest()
        let motor = Flikmotor(app: app, lagring: lagring)
        motor.aterstall()
        app.ersatt(flikar: motor)
        Flikkanaler.registrera(motor, i: app)
        app.labb.registrera("flikar", beskrivning: "Tre flikar mot lokala sidor, byte, bakåt/framåt, privat flik, nedladdning, "
                            + "historik, dialoger, felsida, zoom, sovande flikar och återställning efter omstart") { k in
            try await FlikarProv.kor(k)
        }
    }

    static func starta(i app: AppMiljo) async {
        (app.flikar as? Flikmotor)?.starta()
    }
}

// MARK: - Händelser från Flikar

// Bara Flikar kan använda typerna så länge de ligger här. De är tänkta att flytta till Gemensamt/Handelser.swift
// (se slutrapporten), så att Skal kan lyssna utan att bero på den här mappen.

/// En flik öppnades (ny flik, länk med target=_blank, window.open eller ångrad stängning).
struct FlikOppnad: AppHandelse {
    let flik: UUID
    let privat: Bool
    /// Fliken som öppnade den (popup och länkar som öppnar nytt fönster).
    let oppnadAv: UUID?
}

struct FlikStangd: AppHandelse {
    let flik: UUID
    let privat: Bool
}

struct FlikAktiverad: AppHandelse {
    let flik: UUID
}

/// Fliken släppte sin webbvy för att spara minne (`flikar.sova`, minnesvarning).
struct FlikSomnade: AppHandelse {
    let flik: UUID
}

/// Fliken fick en webbvy igen.
struct FlikVaknade: AppHandelse {
    let flik: UUID
}

/// En sida gick in i eller ut ur helskärm (video eller Fullscreen API). Skalet kan gömma sina rader.
struct FlikHelskarm: AppHandelse {
    let flik: UUID
    let helskarm: Bool
}

struct FlikNedladdningKlar: AppHandelse {
    let id: String
    let fil: URL
    let privat: Bool
}

struct FlikNedladdningMisslyckades: AppHandelse {
    let id: String
    let text: String
}

struct FlikHistorikAndrad: AppHandelse {}

struct FlikBokmarkenAndrade: AppHandelse {}
