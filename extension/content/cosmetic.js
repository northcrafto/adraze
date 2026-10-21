// Ber bakgrunden lägga in CSS som döljer annonsytor i den här ramen, och skickar vidare vaktens räknare
(() => {
  if (window.__adraze) return;
  window.__adraze = true;
  const host = location.hostname || (() => { try { return window.top.location.hostname; } catch { return ""; } })();
  if (host) chrome.runtime.sendMessage({ typ: "css", host }).then((svar) => svar?.lockbete && lockbeten(svar.lockbete, host)).catch(() => {});
  document.addEventListener("adraze:stoppad", () => chrome.runtime.sendMessage({ typ: "popup-stoppad" }).catch(() => {}));

  // Lockbeten: sajter som letar efter blockerare lägger in en tom "annons" (class="adsbox" o.d.) och kollar om
  // den döljs. Vår regel: ett element som våra egna regler dolt får visas igen om det ändå är osynligt för
  // människor, alltså tomt, utan något som ritas, och antingen utanför sidan eller högst en textrad högt.
  // Då förlorar ingen något på att det visas, och sajten ser ingen blockerare. Allt annat förblir dolt,
  // och element som sajten själv döljer rörs aldrig.
  function lockbeten(attr, host) {
    const ANNONSNAMN = /ad|banner|sponsor|promo|google|dfp|gpt|taboola|outbrain|doubleclick/i;
    const INNEHALL = "img,video,iframe,canvas,svg,picture,object,embed,a[href],input,button";
    const MAX_HOJD = 30;
    const markerade = new Set();

    const tomt = (el) => !el.textContent.trim() && !el.querySelector(INNEHALL) && el.childElementCount < 5;
    const ritarInget = (el) => {
      const st = getComputedStyle(el);
      return st.backgroundImage === "none" && st.backgroundColor === "rgba(0, 0, 0, 0)" && st.boxShadow === "none" &&
        !(parseFloat(st.borderTopWidth) || parseFloat(st.borderBottomWidth) || parseFloat(st.borderLeftWidth) || parseFloat(st.borderRightWidth));
    };
    const osynligt = (el) => {
      if (!tomt(el) || !ritarInget(el)) return false;
      const r = el.getBoundingClientRect();
      const utanfor = r.right + scrollX <= 0 || r.bottom + scrollY <= 0 || r.left + scrollX >= document.documentElement.scrollWidth;
      return utanfor || r.height <= MAX_HOJD || r.width <= 2;
    };

    // Våra dölj-regler för en uppsättning klasser/id, hämtade från bakgrunden en gång per uppsättning
    const regler = new Map();
    const doljsAvOss = async (el) => {
      const tokens = [...el.classList, el.id].filter(Boolean).sort();
      const nyckel = tokens.join(" ");
      if (!regler.has(nyckel)) regler.set(nyckel, chrome.runtime.sendMessage({ typ: "dolj-regler", host, tokens }).catch(() => []));
      return (await regler.get(nyckel)).some((sel) => { try { return el.matches(sel); } catch { return false; } });
    };

    // Storleksändringar provas direkt (körs efter layout men före målning), så en annons som växer i ett
    // lockbete hinner aldrig synas
    const dolj = (el) => { el.removeAttribute(attr); markerade.delete(el); storlek.unobserve(el); };
    const storlek = new ResizeObserver((poster) => { for (const { target } of poster) if (markerade.has(target) && !osynligt(target)) dolj(target); });
    const prova = async (el) => {
      if (markerade.has(el) || !ANNONSNAMN.test(`${el.id} ${el.getAttribute("class") || ""}`) || !tomt(el)) return;
      if (getComputedStyle(el).display !== "none" || !(await doljsAvOss(el)) || !el.isConnected) return;
      // Visa på prov i samma uppgift (innan något ritas), mät, och dölj igen om det skulle synas
      el.setAttribute(attr, "");
      if (getComputedStyle(el).display !== "none" && osynligt(el)) { markerade.add(el); storlek.observe(el); }
      else el.removeAttribute(attr);
    };

    const ny = (n) => {
      if (n.nodeType !== 1) return;
      prova(n);
      if (n.childElementCount) for (const barn of n.querySelectorAll("[class],[id]")) prova(barn);
    };
    new MutationObserver((andringar) => {
      for (const a of andringar) {
        // Ett lockbete som fått innehåll är en riktig annons: dölj det igen innan det ritas
        if (markerade.size) for (const el of markerade) if (el.contains(a.target) && (!el.isConnected || !osynligt(el))) dolj(el);
        if (a.type === "attributes") { if (a.target !== document.documentElement) prova(a.target); }
        else for (const n of a.addedNodes) ny(n);
      }
      for (const el of markerade) if (!el.isConnected) dolj(el);
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id"] });
    if (document.body) ny(document.body);
  }
})();
