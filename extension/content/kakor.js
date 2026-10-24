// Kakrutor: klickar på "Avvisa alla"/"Endast nödvändiga" i kända samtyckesrutor. Bakgrunden har redan
// dolt rutan med CSS (EasyList Cookie), så man ser den aldrig. Ett dolt element går ändå att klicka på.
// Saknas en avvisa-knapp förblir rutan bara dold, och då har inget samtycke getts.
(() => {
  if (window.__adrazeKakor) return;
  window.__adrazeKakor = true;

  // [namn, avvisa-knapp, värdelement med shadow root (om rutan ligger i en sådan)]
  const RUTOR = [
    ["onetrust", "#onetrust-reject-all-handler, .ot-pc-refuse-all-handler"],
    ["cookiebot", "#CybotCookiebotDialogBodyButtonDecline, #CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"],
    ["didomi", "#didomi-notice-disagree-button"],
    ["sourcepoint", "button.sp_choice_type_13"],
    ["google", ".fc-cta-do-not-consent"],
    ["usercentrics", '[data-testid="uc-deny-all-button"]', "#usercentrics-root, #usercentrics-cmp-ui"],
    ["consentmanager", ".cmpboxbtnno", "#cmpwrapper"],
    ["cookieyes", ".cky-btn-reject"],
    ["complianz", ".cmplz-btn.cmplz-deny"],
    ["iubenda", ".iubenda-cs-reject-btn"],
    ["osano", ".osano-cm-denyAll"],
    ["klaro", ".cm-btn-decline"],
    ["termly", '[data-tid="banner-decline"]'],
    ["trustarc", "#truste-consent-required"],
    ["cookiescript", "#cookiescript_reject"],
    ["moove", ".moove-gdpr-infobar-reject-btn"],
    ["cookieinformation", "#declineButton, .coi-banner__decline"],
    ["cookiefirst", '[data-cookiefirst-action="reject"]'],
    ["axeptio", "#axeptio_btn_dismiss"],
    ["borlabs", "[data-cookie-refuse], .brlbs-btn-accept-only-essential"],
    ["cookienotice", "#cn-refuse-cookie"],
    ["shopify", ".shopify-pc__banner__btn-decline"],
    ["quantcast", '.qc-cmp2-summary-buttons button[mode="secondary"]'],
  ];
  // Säkerhetsspärr: knappen ska låta som ett nej, inte "Godkänn" eller "Fler val"
  const NEJ = /avvisa|neka|endast nödvändiga|bara nödvändiga|nödvändiga|reject|decline|deny|disagree|refuse|do not consent|necessary only|only necessary|essential|ablehnen|nur notwendige|refuser|rechazar|rifiuta|weiger|afvis|avslå|hylkää|odmítn|odrzu|nein|^no$|^nej$/i;
  const JA = /godkänn|acceptera|tillåt alla|accept|agree|allow all|zustimmen|akzeptieren|alle erlauben/i;
  // "Betala eller godkänn"-rutor: ett nej som kostar pengar klickar vi aldrig på
  const BETAL = /betal|prenumer|abonn|subscri|\bpay|kr\s*\/\s*m|bezahl|\babo\b|payant|pagar|€|£/i;

  // Rutor där nej ligger ett lager in: [namn, finns inte direkt-nej (då gäller inte stegen), steg …]
  const STEG = [
    ["didomi", "#didomi-notice-disagree-button", "#didomi-notice-learn-more-button", "#btn-toggle-disagree, .didomi-consent-popup-actions [aria-label*='Neka'], .didomi-consent-popup-actions [aria-label*='Disagree']", "#btn-toggle-save, .didomi-consent-popup-actions .didomi-button-highlight"],
  ];
  // Rutor som döljs i toppramen om inget gratis nej finns: [namn, så känns rutan igen i den här ramen]
  const DOLJ = [
    ["sourcepoint", 'button[class*="sp_choice_type"]'],
    ["didomi", "#didomi-notice-agree-button"],
  ];

  const MAX_TID = 30_000;
  const start = Date.now();
  const klickade = new Map();

  const hitta = (sel, varden) => {
    const el = document.querySelector(sel);
    if (el || !varden) return el;
    for (const v of document.querySelectorAll(varden)) {
      const i = v.shadowRoot?.querySelector(sel);
      if (i) return i;
    }
    return null;
  };

  // Googles och YouTubes egen samtyckesruta ("Innan du fortsätter till YouTube") är inte en vanlig CMP
  // och har inga stabila klasser, så vi letar reda på "Avvisa alla" i rutan/mellansidan och klickar den.
  function googleSamtycke() {
    const host = location.hostname;
    const mellansida = /(^|\.)consent\.(youtube|google)\.com$/.test(host);
    const yt = /(^|\.)youtube(-nocookie)?\.com$/.test(host) || /(^|\.)google\.[a-z.]+$/.test(host);
    if (!mellansida && !yt) return;
    let scope;
    if (mellansida) scope = document;      // hela sidan ÄR samtyckesrutan
    else {
      scope = document.querySelector('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"], #consent-bump, .consent-bump');
      if (!scope) return;                  // ingen ruta på youtube.com → inget att göra
    }
    for (const b of scope.querySelectorAll('button, [role="button"], a[role="button"]')) {
      if (!b.isConnected) continue;
      const txt = (b.innerText || b.textContent || b.getAttribute("aria-label") || "").trim();
      if (!txt || txt.length > 120) continue;
      if (!NEJ.test(txt) || JA.test(txt) || BETAL.test(txt)) continue;
      if (/fler|more|alternativ|options|customize|anpassa|manage|hantera|inställ|settings|learn|läs mer|logga in|sign in/i.test(txt)) continue;
      const ggr = klickade.get(b) || 0;
      if (ggr >= 3) continue;
      klickade.set(b, ggr + 1);
      b.click();
      if (!ggr) { klar = true; chrome.runtime.sendMessage({ typ: "kaka-avvisad", cmp: "youtube" }).catch(() => {}); }
      return;
    }
  }

  function leta() {
    googleSamtycke();
    if (klar) return;
    for (const [namn, sel, varden] of RUTOR) {
      const knapp = hitta(sel, varden);
      if (!knapp || !knapp.isConnected) continue;
      const text = (knapp.innerText || knapp.textContent || knapp.getAttribute("aria-label") || "").trim();
      const nej = !text || NEJ.test(text) || !JA.test(text) && namn !== "quantcast";
      if (!nej || BETAL.test(knapp.textContent)) continue;
      // Samma knapp kvar efter ett klick: sajtens skript hann inte koppla in sig, prova igen (högst tre gånger)
      const ggr = klickade.get(knapp) || 0;
      if (ggr >= 3) continue;
      klickade.set(knapp, ggr + 1);
      knapp.click();
      if (!ggr) { klar = true; chrome.runtime.sendMessage({ typ: "kaka-avvisad", cmp: namn }).catch(() => {}); }
    }
    if (klar) return;
    for (const [namn, direkt, ...steg] of STEG) {
      if (pagaende || provade.has(namn) || document.querySelector(direkt) || !document.querySelector(steg[0])) continue;
      provade.add(namn);
      pagaende = true;
      stega(namn, steg);
    }
    // Inget gratis nej på en stund: dölj rutan i stället (inget samtycke ges)
    for (const [namn, igen] of DOLJ) {
      if (dolda.has(namn) || !document.querySelector(igen)) continue;
      if (!sedd.has(namn)) { sedd.set(namn, Date.now()); continue; }
      if (Date.now() - sedd.get(namn) < 3000 || pagaende) continue;
      dolda.add(namn);
      chrome.runtime.sendMessage({ typ: "kak-dolj", cmp: namn }).catch(() => {});
    }
  }

  let klar = false, pagaende = false;
  const sedd = new Map(), dolda = new Set(), provade = new Set();
  const vantaPa = (sel, ms = 4000) => new Promise((ok) => {
    const t0 = Date.now();
    const kolla = () => { const el = document.querySelector(sel); if (el || Date.now() - t0 > ms) ok(el); else setTimeout(kolla, 150); };
    kolla();
  });
  async function stega(namn, steg) {
    for (const sel of steg) {
      const knapp = await vantaPa(sel);
      if (!knapp || BETAL.test(knapp.textContent)) { pagaende = false; return; }
      knapp.click();
      await new Promise((ok) => setTimeout(ok, 300));
    }
    klar = true;
    pagaende = false;
    chrome.runtime.sendMessage({ typ: "kaka-avvisad", cmp: namn }).catch(() => {});
  }

  let vantar = false;
  const schemalagg = () => {
    if (vantar) return;
    vantar = true;
    setTimeout(() => { vantar = false; leta(); }, 250);
  };

  chrome.runtime.sendMessage({ typ: "kakor", host: location.hostname }).then((svar) => {
    if (!svar?.pa) return;
    const vakt = new MutationObserver(() => {
      if (Date.now() - start > MAX_TID) { vakt.disconnect(); return; }
      schemalagg();
    });
    vakt.observe(document.documentElement, { childList: true, subtree: true });
    // Rutor som kommer utan DOM-ändring (bara en klass som slås på) fångas av en glesare koll
    const tick = setInterval(() => { if (Date.now() - start > MAX_TID) clearInterval(tick); else leta(); }, 1500);
    schemalagg();
  }).catch(() => {});
})();
