// AdRaze på YouTube (MAIN world, document_start): hoppa förbi förvideo- och mellanreklam direkt och dölj den.
// Reklamfälten rensas medvetet INTE ur spelarens data (json-prune): YouTube lägger då in svart buffring lika lång
// som reklamen vid varje videobyte, eftersom servern aldrig får se reklamen "spelas". En reklam som spolas till
// slutet räknas däremot som visad, så nästa video startar lika snabbt som utan tillägget.
// YouTube skickar dessutom lockbeten genom fetch för att upptäcka tillägg som ändrar svaren, så vi rör inga svar.
(() => {
  "use strict";

  // Dölj reklamen medan den spolas förbi (bild och reklamknappar), spelarens övriga knappar lämnas
  const STIL =
    "#movie_player.ad-showing video{opacity:0!important}" +
    "#movie_player.ad-showing .ytp-ad-player-overlay-layout,#movie_player.ad-showing .ytp-ad-player-overlay," +
    "#movie_player.ad-showing .ytp-ad-image-overlay,#movie_player .ytp-ad-overlay-container{visibility:hidden!important}";
  function laggTillStil() {
    const rot = document.head || document.documentElement;
    if (!rot) return false;
    const s = document.createElement("style");
    s.textContent = STIL;
    rot.appendChild(s);
    return true;
  }
  if (!laggTillStil()) document.addEventListener("readystatechange", laggTillStil, { once: true });

  const tystad = new WeakMap(); // video -> om den var tyst innan vi tystade den
  function hoppa() {
    const m = document.getElementById("movie_player");
    if (!m) return;
    const v = m.querySelector("video");
    if (!m.classList.contains("ad-showing")) {
      // Reklamen är slut: ge tillbaka ljudet om det var vi som tog det
      if (v && tystad.has(v)) { if (v.muted && !tystad.get(v)) v.muted = false; tystad.delete(v); }
      return;
    }
    // Tysta reklamen (spelaren kan slå på ljudet igen vid nästa reklam i samma block)
    if (v) { if (!tystad.has(v)) tystad.set(v, v.muted); if (!v.muted) v.muted = true; }
    m.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button")?.click();
    // Spola först när reklamen hunnit börja spelas: spolas den innan start räknas den inte som visad
    // och YouTube håller då inne nästa video lika länge som reklamen
    if (!v || v.paused || !(v.currentTime > 0) || !isFinite(v.duration) || v.currentTime >= v.duration - 0.1) return;
    // Bara en video vars längd skiljer sig från huvudvideons, så att innehållet aldrig hoppas över
    // (reklam inbakad i själva strömmen har samma längd som videon och lämnas i fred)
    const langd = Number(m.getPlayerResponse?.()?.videoDetails?.lengthSeconds) || 0;
    if (Math.abs(v.duration - langd) > 1.5) v.currentTime = v.duration;
  }

  // YouTubes ruta "Annonsblockerare är inte tillåtna": stäng den med rutans egen avvisa-knapp
  // (aldrig "Tillåt annonser" eller Premium) och starta videon igen om rutan pausade den.
  const AVVISA = /^(nej tack|no thanks|inte nu|not now|stäng|close|avvisa|dismiss|hoppa över|skip)$/i;
  const ALDRIG = /tillåt|allow|premium|prova|try|logga in|sign in/i;
  let spelade = false;
  function avvisaRuta() {
    const v = document.querySelector("#movie_player video");
    const ruta = document.querySelector("ytd-enforcement-message-view-model");
    if (!ruta) { spelade = !!(v && !v.paused); return; }
    const dialog = ruta.closest("tp-yt-paper-dialog") || ruta;
    const text = b => (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim();
    const knappar = [...dialog.querySelectorAll("#dismiss-button button, button, tp-yt-paper-button, a[role=button]")];
    const knapp = knappar.find(b => b.closest("#dismiss-button") && !ALDRIG.test(text(b))) ||
                  knappar.find(b => AVVISA.test(text(b)) && !ALDRIG.test(text(b)));
    if (knapp) knapp.click();
    else {
      dialog.remove();
      document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach(b => b.remove());
      if (document.body) document.body.style.removeProperty("overflow");
    }
    if (v && v.paused && spelade) v.play().catch(() => {});
  }

  // Kolla när videon spelar och dessutom med jämna mellanrum som reserv
  document.addEventListener("timeupdate", hoppa, { capture: true, passive: true });
  setInterval(() => { hoppa(); avvisaRuta(); }, 250);
})();
