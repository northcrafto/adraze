// Fönstrets sida av anpassningsbutiken (se ../anpassa.js). Laddas före shell.js.
//   Anpassa.get('tema.accent', '#ff4b1f')   → värdet (synkront, från fönstrets kopia)
//   await Anpassa.set('tema.accent', '#2f9e67', 'Accentfärg')   → { ok } (ok:false, error:'barnlast' i barnläge)
//   Anpassa.on('tema.', (nyckel, värde) => ...)   → lyssna på en nyckel eller ett prefix (slutar med '.'); '*' = allt
//   Anpassa.angra(), Anpassa.aterstall('tema.'), Anpassa.historik(), Anpassa.exportera('tema.'), Anpassa.importera(kod, 'tema.')
(function () {
  const b = window.anpassaBro;
  if (!b) return;
  let st = { varden: {}, register: {}, barn: false };
  try { st = b.alla() || st; } catch {}
  const lyss = new Set();
  const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  b.onAndrad(({ nyckel, varde }) => {
    if (varde === undefined || varde === null) delete st.varden[nyckel]; else st.varden[nyckel] = varde;
    for (const [m, fn] of lyss) if (m === '*' || m === nyckel || (m.endsWith('.') && nyckel.startsWith(m))) { try { fn(nyckel, kopia(varde)); } catch (e) { console.warn('[anpassa]', e); } }
  });
  window.Anpassa = {
    get(nyckel, def) {
      if (nyckel in st.varden) return kopia(st.varden[nyckel]);
      if (def !== undefined) return def;
      const r = st.register[nyckel]; return r ? kopia(r.standard) : undefined;
    },
    alla: () => kopia(st.varden),
    set: (nyckel, varde, etikett) => b.satt(nyckel, varde, etikett),
    on(monster, fn) { const p = [monster, fn]; lyss.add(p); return () => lyss.delete(p); },
    angra: () => b.angra(),
    aterstall: (prefix) => b.aterstall(prefix),
    historik: () => b.historik(),
    exportera: (prefix) => b.exportera(prefix),
    importera: (kod, prefix) => b.importera(kod, prefix),
    barnlage: () => { try { st.barn = b.alla().barn; } catch {} return !!st.barn; },
  };
})();
