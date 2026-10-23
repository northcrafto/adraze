// Google-inloggning åt AdRaze-webbläsaren. Fönstret ägs av webbläsaren, som läser nyckeln ur #klar=… och stänger det.
const API = document.getElementById('ag').dataset.api;
const msg = document.getElementById('ag-msg');
const visa = (text, bra) => { msg.textContent = text || ''; msg.classList.toggle('bra', !!bra); };

async function post(sokvag, kropp) {
  const r = await fetch(API + sokvag, { method: kropp ? 'POST' : 'GET', credentials: 'omit', headers: kropp ? { 'content-type': 'application/json' } : {}, body: kropp ? JSON.stringify(kropp) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'Något gick fel. Försök igen.');
  return j;
}

(async () => {
  let clientId;
  try { clientId = (await post('/auth/config')).googleClientId; } catch { return visa('Kunde inte nå AdRaze. Kolla nätet och försök igen.'); }
  if (!clientId) return visa('Google-inloggning är inte påslagen just nu.');
  await new Promise((ok, fel) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = fel; document.head.append(s); }).catch(() => visa('Kunde inte ladda Google.'));
  if (!window.google) return;
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      visa('Loggar in…', true);
      try {
        const j = await post('/auth/google', { credential, app: true });
        visa('Klart! Du är inloggad i AdRaze.', true);
        location.hash = 'klar=' + encodeURIComponent(JSON.stringify({ token: j.token, enhet: j.enhet, email: j.me.email, namn: j.me.namn || '' }));
      } catch (e) { visa(e.message); }
    },
  });
  google.accounts.id.renderButton(document.getElementById('google-knapp'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300, locale: 'sv' });
})();
