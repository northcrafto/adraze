import Foundation
import UIKit
import WebKit

/// Falk ser och styr fliken (datorns `krypto:tab`, `krypto:page` och `krypto:act` i `browser/main.js`).
///
/// Allt körs i en egen innehållsvärld (`AdRazeFalk`), så att sidans skript varken ser eller kan påverka det.
/// Privata flikar läses och styrs aldrig. Lösenord och kortuppgifter läses eller skrivs aldrig, och knappar som
/// köper något eller skickar ett formulär kräver att användaren godkänner i Falk först (`godkann`).
///
/// Ägare: Falk.
@MainActor
enum FalkFlik {
    static let varld = WKContentWorld.world(name: "AdRazeFalk")

    // MARK: - Läget

    static func arWebbsida(_ u: URL?) -> Bool {
        let s = u?.scheme?.lowercased()
        return s == "http" || s == "https"
    }

    static func samtycke(_ app: AppMiljo) -> Bool { app.installningar.hamta("webb.falkSamtycke")?.bool == true }
    static func sidaPa(_ app: AppMiljo) -> Bool { app.installningar.hamta("webb.falkSida")?.bool != false }
    static func falkAv(_ app: AppMiljo) -> Bool { app.installningar.hamta("falk.av")?.bool == true }

    /// Fliken Falk tittar på: den aktiva.
    static func flik(_ app: AppMiljo) -> (any Flik)? { app.flikar.aktiv }

    // MARK: - krypto:tab

    /// `{ url, titel, av }` för den aktiva fliken om den visar en webbsida, annars `null`. `av` = Falk får inte läsa
    /// den (Granska sidan avstängt, inget samtycke än eller en privat flik). `utanSamtycke` (bara iPhone): det
    /// enda som saknas är samtycket, så sidan kan erbjuda frågor om sidan.
    static func tab(_ app: AppMiljo) -> JSONVarde {
        guard let f = flik(app), let url = f.url, arWebbsida(url) else { return .null }
        let utanSamtycke = !samtycke(app)
        return ["url": .text(url.absoluteString), "titel": .text(f.titel),
                "av": .bool(!sidaPa(app) || utanSamtycke || f.privat),
                "utanSamtycke": .bool(utanSamtycke && sidaPa(app) && !f.privat && !falkAv(app))]
    }

    // MARK: - krypto:page

    /// En bild av sidan: adress, titel, text och numrerade knappar, länkar och fält. `null` när Falk inte får läsa.
    static func sida(_ app: AppMiljo) async -> JSONVarde {
        guard !falkAv(app), sidaPa(app), samtycke(app), let f = flik(app), arWebbsida(f.url), !f.privat else { return .null }
        let vy = f.webbvy
        let svar = await medTid(6) { try? await vy.callAsyncJavaScript(bildJS, arguments: [:], in: nil, contentWorld: varld) }
        guard let svar, let v = svar else { return .null }
        let j = JSONVarde(foundation: v)
        return j.objekt == nil ? .null : j
    }

    // MARK: - krypto:act

    static func fel(_ s: String) -> JSONVarde { ["ok": false, "fel": .text(s)] }

    /// Gör en handling på sidan: `{ name, value, godkant? }` som Falks taggar (klicka, skriv, tangent, gå, scrolla,
    /// tillbaka). Svar som på datorn: `{ ok, vad? }`, `{ ok: false, fel }` eller `{ ok: false, godkann, vad, slag }`.
    static func gor(_ app: AppMiljo, _ a: JSONVarde) async -> JSONVarde {
        guard a.objekt != nil else { return fel("Ingen flik.") }
        if falkAv(app) { return fel("Falk är avstängd i Inställningar.") }
        if !sidaPa(app) || !samtycke(app) { return fel("Sidgranskning är avstängd i Inställningar.") }
        var f = flik(app)
        if let x = f, x.privat { return fel("Falk läser och styr inte privata flikar.") }
        let namn = Falk.fold(a["name"].text ?? "")
        let v = (a["value"].text ?? a["value"].tal.map { String(Int($0)) } ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let godkant = a["godkant"].bool == true

        if namn == "ga" || namn == "oppna" {
            var adress = v
            if adress.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) == nil { adress = "https://" + adress }
            guard adress.range(of: #"^https?://[^\s/]+\.[^\s]+"#, options: [.regularExpression, .caseInsensitive]) != nil,
                  let url = URL(string: adress) else { return fel("Ogiltig adress.") }
            if let x = f, arWebbsida(x.url) {
                x.ladda(url)
            } else {
                f = app.flikar.nyFlik(url, privat: false, aktivera: true)
                try? await Task.sleep(nanoseconds: 900_000_000)
            }
            if let x = f { await vantaLaddat(x, max: 12) }
            return ["ok": true, "vad": .text(adress)]
        }
        guard let fl = f, arWebbsida(fl.url) else { return fel("Det finns ingen webbsida öppen i fliken.") }
        let vy = fl.webbvy

        do {
            switch namn {
            case "tillbaka":
                fl.bakat()
                await vantaLaddat(fl, max: 8)
                return ["ok": true]

            case "scrolla":
                let upp = v.range(of: "upp|up", options: [.regularExpression, .caseInsensitive]) != nil
                _ = try await vy.callAsyncJavaScript("window.scrollBy(0, (upp ? -1 : 1) * innerHeight * 0.85); return true",
                                                      arguments: ["upp": upp], in: nil, contentWorld: varld)
                try? await Task.sleep(nanoseconds: 500_000_000)
                return ["ok": true]

            case "tangent":
                let tangent = ["enter": "Enter", "tab": "Tab", "escape": "Escape", "esc": "Escape", "ner": "ArrowDown", "upp": "ArrowUp"][v.lowercased()] ?? "Enter"
                if tangent == "Enter" && !godkant {
                    // Enter på en knapp eller i ett formulärfält skickar något: användaren godkänner först
                    let r = await medTid(4) { try? await vy.callAsyncJavaScript(fokusJS, arguments: [:], in: nil, contentWorld: varld) }
                    let reserv: [String: Any] = ["risk": true, "namn": ""]
                    let fokus = JSONVarde(foundation: (r ?? nil) ?? reserv)
                    if fokus["risk"].bool != false {
                        let n = fokus["namn"].text ?? ""
                        return ["ok": false, "godkann": true, "vad": .text(n.isEmpty ? "Enter" : n), "slag": .text(arKop(n) ? "kop" : "formular")]
                    }
                }
                _ = try await vy.callAsyncJavaScript(tangentJS, arguments: ["key": tangent], in: nil, contentWorld: varld)
                await vantaLaddat(fl, max: 8)
                return ["ok": true]

            default:
                break
            }

            let delar = v.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            guard let id = Int(delar.first?.trimmingCharacters(in: .whitespaces) ?? ""), id > 0 else { return fel("Saknar nummer på elementet.") }
            let infoSvar = try await vy.callAsyncJavaScript(infoJS, arguments: ["id": id], in: nil, contentWorld: varld)
            guard let infoSvar, case let info = JSONVarde(foundation: infoSvar), info.objekt != nil else {
                return fel("Hittade inte element \(id) längre. Sidan kan ha ändrats.")
            }
            let elnamn = info["namn"].text ?? ""

            switch namn {
            case "klicka":
                if !godkant && arKop(info["etiketter"].text ?? elnamn) { return ["ok": false, "godkann": true, "vad": .text(elnamn), "slag": "kop"] }
                if !godkant && info["submit"].bool == true {
                    return ["ok": false, "godkann": true, "vad": .text(elnamn.isEmpty ? "Skicka" : elnamn), "slag": "formular"]
                }
                _ = try await vy.callAsyncJavaScript(klickaJS, arguments: ["id": id], in: nil, contentWorld: varld)
                await vantaLaddat(fl, max: 10)
                return ["ok": true, "vad": .text(elnamn)]

            case "skriv":
                if info["hemligt"].bool == true { return fel("Lösenord och kortuppgifter fyller användaren i själv.") }
                if info["skrivbar"].bool != true { return fel("Det går bara att skriva i textfält.") }
                let text = delar.count > 1 ? delar[1] : ""
                if info["tag"].text == "select" {
                    let r = try await vy.callAsyncJavaScript(valjJS, arguments: ["id": id, "t": text.lowercased()], in: nil, contentWorld: varld)
                    return (r as? Bool) == true ? ["ok": true, "vad": .text(elnamn)] : fel("Hittade inget sådant val i listan.")
                }
                _ = try await vy.callAsyncJavaScript(skrivJS, arguments: ["id": id, "text": text], in: nil, contentWorld: varld)
                try? await Task.sleep(nanoseconds: 300_000_000)
                return ["ok": true, "vad": .text(elnamn)]

            default:
                return fel("Okänd handling.")
            }
        } catch {
            return fel(FalkSprak.fyll("Det gick inte: {x}", ["x": String(error.localizedDescription.prefix(120))]))
        }
    }

    // MARK: - Hjälp

    /// Väntar tills fliken laddat klart (högst `max` sekunder).
    static func vantaLaddat(_ f: any Flik, max: Double) async {
        try? await Task.sleep(nanoseconds: 300_000_000)
        let t0 = Date()
        while f.laddar, Date().timeIntervalSince(t0) < max {
            try? await Task.sleep(nanoseconds: 120_000_000)
        }
    }

    /// Kör `f`, men ger `nil` om den inte svarat på `sekunder` (ett skript på en sida som hänger sig).
    static func medTid<T>(_ sekunder: Double, _ f: @escaping @MainActor () async -> T) async -> T? {
        await withCheckedContinuation { (c: CheckedContinuation<T?, Never>) in
            let e = FalkEngang<T>(c)
            Task { @MainActor in e.ge(await f()) }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(sekunder * 1_000_000_000))
                e.ge(nil)
            }
        }
    }

    /// Köp- och betalknappar (samma mönster som datorns `FALK_KOP`).
    static let kopMonster = try? NSRegularExpression(
        pattern: #"(slutför|genomför|bekräfta|lägg|skicka|godkänn|fullfölj)\s*(köp|beställning|order|betalning)|^\s*(köp|betala|beställ|swisha)(\s+(nu|och betala|med\s+\S+))?\s*$|\bbetala\b|place\s+order|buy\s+now|\bpay\b|complete\s+(purchase|order|payment)|confirm\s+(order|purchase|payment)|submit\s+(order|payment)|purchase"#,
        options: [.caseInsensitive])

    static func arKop(_ s: String) -> Bool {
        guard let m = kopMonster else { return false }
        return m.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    // MARK: - Skripten (körs i världen AdRazeFalk)

    /// Datorns `FALK_BILD`: text och numrerade element. Elementen märks med `data-falk` för handlingarna.
    static let bildJS = #"""
    const syns = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
    document.querySelectorAll('[data-falk]').forEach((e) => e.removeAttribute('data-falk'));
    const sel = 'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=option],[contenteditable=true],summary';
    const items = []; let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      if (n >= 160) break; if (!syns(el)) continue;
      const id = ++n; el.setAttribute('data-falk', id);
      const tag = el.tagName.toLowerCase(), typ = (el.getAttribute('type') || '').toLowerCase();
      const falt = /^(input|textarea|select)$/.test(tag);
      let namn = (el.getAttribute('aria-label') || (falt ? '' : el.innerText) || el.title || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
      if (!namn && el.querySelector('img[alt]')) namn = el.querySelector('img[alt]').alt;
      if (falt) { const l = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); namn = [namn, l && l.innerText, el.placeholder, el.name].filter(Boolean).join(' · ').replace(/\s+/g, ' '); }
      const hemligt = typ === 'password' || /cc-|card|kort|cvc|cvv|kontonummer/i.test((el.autocomplete || '') + ' ' + (el.name || '') + ' ' + (el.id || ''));
      const r = el.getBoundingClientRect();
      let varde = falt && !hemligt ? String(el.value || '').slice(0, 60) : '';
      if (tag === 'select') { varde = (el.selectedOptions[0] && el.selectedOptions[0].text) || ''; namn = (namn ? namn + ' · ' : '') + 'val: ' + Array.from(el.options).slice(0, 12).map((o) => o.text.trim()).join(', '); }
      items.push({ id, tag, typ, namn: namn.slice(0, 160), varde, hemligt, synlig: r.top < innerHeight && r.bottom > 0 });
    }
    const text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').slice(0, 14000);
    return { url: location.href, titel: document.title, text, items, nere: Math.round(scrollY), hojd: document.documentElement.scrollHeight, fonster: innerHeight };
    """#

    /// Skickar Enter något? (knapp eller länk i fokus, ett formulärfält, en textruta)
    static let fokusJS = #"""
    const el = document.activeElement; if (!el || el === document.body || el === document.documentElement) return { risk: false };
    const tag = el.tagName.toLowerCase(), typ = (el.getAttribute('type') || '').toLowerCase();
    const knapp = /^(button|a|summary|iframe|frame)$/.test(tag) || el.getAttribute('role') === 'button' || (tag === 'input' && /^(submit|image|button|reset|checkbox|radio)$/.test(typ));
    const std = el.form && el.form.querySelector('button:not([type]),button[type=submit],input[type=submit],input[type=image]');
    const namn = ((std && (std.getAttribute('aria-label') || std.innerText || std.value)) || el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    return { risk: !!(knapp || el.form || tag === 'textarea' || el.isContentEditable), namn };
    """#

    /// En tangent på elementet i fokus. Tab flyttar fokus; Enter i ett formulärfält skickar formuläret som
    /// webbläsaren gör, om ingen av sidans hanterare stoppade det.
    static let tangentJS = #"""
    const el = document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body;
    if (key === 'Tab') {
      const sel = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable=true]';
      const alla = Array.from(document.querySelectorAll(sel)).filter((x) => { const r = x.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
      const nasta = alla[(alla.indexOf(document.activeElement) + 1) % Math.max(1, alla.length)];
      if (nasta) { nasta.focus(); nasta.scrollIntoView({ block: 'center' }); }
      return true;
    }
    const kod = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 }[key] || 13;
    const hand = (typ) => { const e = new KeyboardEvent(typ, { key, code: key, bubbles: true, cancelable: true, composed: true });
      try { Object.defineProperty(e, 'keyCode', { get: () => kod }); Object.defineProperty(e, 'which', { get: () => kod }); } catch {}
      return el.dispatchEvent(e); };
    const ned = hand('keydown');
    if (key === 'Enter') hand('keypress');
    hand('keyup');
    if (key === 'Enter' && ned) {
      const tag = el.tagName.toLowerCase();
      if (/^(button|a|summary)$/.test(tag) || el.getAttribute('role') === 'button') el.click();
      else if (tag === 'input' && el.form) { if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit(); else el.form.submit(); }
    }
    return true;
    """#

    /// Fakta om element nummer `id` (det rullas fram till mitten).
    static let infoJS = #"""
    const el = document.querySelector('[data-falk="' + id + '"]'); if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const typ = (el.getAttribute('type') || '').toLowerCase();
    const namn = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const hemligt = typ === 'password' || /cc-|card|kort|cvc|cvv|kontonummer/i.test((el.autocomplete || '') + ' ' + (el.name || '') + ' ' + (el.id || ''));
    const tag = el.tagName.toLowerCase();
    const submit = !!el.form && ((tag === 'button' && (!typ || typ === 'submit')) || (tag === 'input' && (typ === 'submit' || typ === 'image')));
    const skrivbar = tag === 'textarea' || tag === 'select' || el.isContentEditable || (tag === 'input' && /^(|text|search|email|tel|url|number|date|datetime-local|month|week|time)$/.test(typ));
    const etiketter = [el.getAttribute('aria-label'), el.innerText, el.value, el.title].filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 300);
    return { namn, tag, hemligt, submit, skrivbar, etiketter };
    """#

    /// Ett tryck på elementet: pekare och mus ned/upp och sedan klick, som ett finger.
    static let klickaJS = #"""
    const el = document.querySelector('[data-falk="' + id + '"]'); if (!el) return false;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opt = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'touch', isPrimary: true }, opt))); } catch {}
    el.dispatchEvent(new MouseEvent('mousedown', opt));
    try { el.focus({ preventScroll: true }); } catch {}
    try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'touch', isPrimary: true }, opt))); } catch {}
    el.dispatchEvent(new MouseEvent('mouseup', opt));
    el.click();
    return true;
    """#

    /// Skriver text i ett fält: markerar det som står där och skriver över (som datorns insertText).
    static let skrivJS = #"""
    const el = document.querySelector('[data-falk="' + id + '"]'); if (!el) return false;
    el.focus();
    try { if (el.isContentEditable) document.execCommand('selectAll', false); else if (el.select) el.select(); } catch {}
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!el.isContentEditable && (!ok || el.value !== text)) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && d.set) d.set.call(el, text); else el.value = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable && !ok) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return true;
    """#

    /// Väljer ett alternativ i en lista.
    static let valjJS = #"""
    const el = document.querySelector('[data-falk="' + id + '"]'); if (!el) return false;
    const o = Array.from(el.options).find((o) => o.text.toLowerCase().includes(t) || o.value.toLowerCase() === t); if (!o) return false;
    el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
    """#
}

/// Ett svar som kan komma från två håll (resultatet eller en tidsgräns); bara det första gäller.
final class FalkEngang<T>: @unchecked Sendable {
    private let las = NSLock()
    private var c: CheckedContinuation<T?, Never>?

    init(_ c: CheckedContinuation<T?, Never>) { self.c = c }

    func ge(_ v: T?) {
        las.lock()
        let k = c
        c = nil
        las.unlock()
        k?.resume(returning: v)
    }
}
