'use strict';
/* Anpassa → egna sökmotorer och snabbord. Själva sökningen sker i skalet (ui/anpassa-sokmotorer.js);
 * här registreras bara nycklarna i Anpassa-butiken.
 *   sok.egna     → [{ id, namn, url (med %s), snabbord }]   egna sökmotorer, i ordning
 *   sok.standard → id för en egen sökmotor som används i stället för den inbyggda (saknas = den inbyggda)
 * Båda är barnlåsta och används aldrig i barnläge: där söker barnet med den inbyggda sökmotorn som förut.
 * De följer inte heller med i delningskoder (en kod från någon annan ska inte kunna styra var du söker). */

// Förslagen som finns från start (går att ta bort och lägga till igen under Inställningar → Anpassa)
const FORSLAG = [
  { id: 'f-ddg', namn: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', snabbord: 'ddg' },
  { id: 'f-sp', namn: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s', snabbord: 'sp' },
  { id: 'f-bs', namn: 'Brave Search', url: 'https://search.brave.com/search?q=%s', snabbord: 'bs' },
  { id: 'f-eco', namn: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s', snabbord: 'eco' },
  { id: 'f-w', namn: 'Wikipedia', url: 'https://sv.wikipedia.org/w/index.php?search=%s', snabbord: 'w' },
  { id: 'f-yt', namn: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s', snabbord: 'yt' },
  { id: 'f-gh', namn: 'GitHub', url: 'https://github.com/search?q=%s', snabbord: 'gh' },
  { id: 'f-pj', namn: 'Prisjakt', url: 'https://www.prisjakt.nu/search?search=%s', snabbord: 'pj' },
  { id: 'f-bl', namn: 'Blocket', url: 'https://www.blocket.se/recommerce/forsale/search?q=%s', snabbord: 'bl' },
];

function init({ anpassa }) {
  anpassa.registrera({ nyckel: 'sok.egna', standard: FORSLAG, etikett: 'Egna sökmotorer', barnLast: true, importBar: false });
  anpassa.registrera({ nyckel: 'sok.standard', standard: undefined, etikett: 'Standardsökmotor', barnLast: true, importBar: false });
}

module.exports = { init, FORSLAG };
