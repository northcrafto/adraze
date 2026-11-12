// Ordlistan för i18n.js i de små sidorna med strikt CSP (script-src 'self', inga inline-skript): anpassa-gest.html,
// anpassa-toast.html. Språket läses av i18n.js ur localStorage 'adraze-lang' (samma file://-ursprung som skalet);
// ordlistan hämtas från huvudprocessen via popup-preload.js (window.adrazeIpc). Ladda före i18n.js.
window.locale = { load: (l) => { try { return (window.adrazeIpc && window.adrazeIpc.sendSync('i18n:load', l)) || {}; } catch (e) { return {}; } } };
