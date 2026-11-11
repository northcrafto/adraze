// Snötäcket på flikarna (jultemat, browser/ui/jul.css sektion 4). Ritat med samma penna som gorillan – ritkoden i
// ../nya/gorilla.html: en mjuk kurva genom handsatta punkter – som en remsa på 240 × 12 px som upprepas i sidled
// utan skarv. Snön ligger som en hög ovanpå fliken: överkanten är ojämn och sticker upp 4 px ovanför flikens kropp,
// underkanten hänger över kroppen i mjuka bågar med ett par droppar.
//   node snotacke.js                skriver CSS-variablerna som klistras in i jul.css
//   node snotacke.js --svg <mapp>   skriver de två bilderna som filer (för att titta på dem)
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../nya/gorilla.html', 'utf8');
const { smooth } = new Function(html.split('<script>')[1].split('const g=document')[0] + 'return {smooth};')();

const B = 240, H = 12, TAK = 4;   // remsans bredd och höjd; flikens kropp börjar TAK px under remsans överkant
// Överkanten (x, y från remsans överkant): breda kullar och ett par sänkor, aldrig lägre än flikens kropp
const TOPP = [[0, 2.2], [10, 0.9], [22, 0.3], [32, 0.4], [43, 1.6], [52, 3.2], [62, 2.4], [74, 0.8], [88, 0.2], [100, 0.5],
  [112, 1.8], [124, 2.9], [131, 3.3], [141, 2.0], [154, 0.7], [166, 0.3], [178, 0.6], [188, 1.9], [197, 3.1], [207, 1.9], [219, 0.7], [231, 1.4]];
// Underkanten (x, hur långt snön hänger ned över kroppen): ojämna bågar, två droppar som hänger lite längre.
// Där överkanten har en sänka hänger underkanten lite längre, så att täcket aldrig blir tunnare än ett par pixlar.
const KANT = [[0, 3.0], [12, 3.7], [24, 2.5], [39, 1.8], [51, 3.2], [58, 4.8], [65, 2.9], [82, 1.9], [100, 2.4], [116, 3.1],
  [130, 2.9], [142, 3.4], [150, 5.0], [157, 3.1], [172, 2.0], [190, 2.6], [203, 3.9], [212, 2.7], [226, 2.1]];
// Punkterna upprepas på båda sidor så att kurvan går jämnt över skarven mellan två remsor
const period = (P, dy) => [-1, 0, 1].flatMap((k) => P.map(([x, y]) => [x + k * B, y + dy])).filter(([x]) => x > -30 && x < B + 30);
// (talen skrivs kort: 24 i stället för 24.0)
const bana = (smooth(period(TOPP, 0)) + ' ' + smooth(period(KANT, TAK).reverse()).replace(/^M/, 'L') + 'Z').replace(/\.0(?![0-9])/g, '');

// Skuggan är samma form en dryg pixel längre ned, under snön: en kant som blir tunnare där underkanten är brant.
// kontur = en tunn linje runt snön (ljust läge, där fliken själv är vit). preserveAspectRatio='none': remsan trycks
// ihop i höjdled på en kompakt flikrad och i sidled på smala flikar, och ska då fylla hela sin ruta.
function bild({ sno, skugga, ned = 1.1, kontur, tjock = 0.9 }) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${B}' height='${H}' viewBox='0 0 ${B} ${H}' preserveAspectRatio='none'><defs><path id='s' d='${bana}'/></defs>` +
    `<use href='#s' y='${ned}' fill='${skugga}'/><use href='#s' fill='${sno}'${kontur ? ` stroke='${kontur}' stroke-width='${tjock}'` : ''}/></svg>`;
}
const BILDER = {
  // Mörkt läge och temat Jul: snövitt (--jul-sno) med blågrå skuggkant
  '--jul-tacke': bild({ sno: '#fdfcf8', skugga: '#b4c2d1' }),
  // Ljust läge (fliken är vit, flikraden nästan vit): vitt med tydligare blågrå skuggkant och en svag kontur upptill
  '--jul-tacke-ljust': bild({ sno: '#ffffff', skugga: '#a3b8cf', ned: 1.7, kontur: '#c3cfdc', tjock: 0.7 }),
};
const uri = (s) => 'url("data:image/svg+xml,' + s.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E') + '")';

if (require.main === module) {
  const i = process.argv.indexOf('--svg');
  if (i > 0) { const mapp = process.argv[i + 1] || '.'; for (const [namn, s] of Object.entries(BILDER)) fs.writeFileSync(mapp + '/snotacke' + namn.replace('--jul-tacke', '') + '.svg', s + '\n'); }
  else for (const [namn, s] of Object.entries(BILDER)) console.log('  ' + namn + ': ' + uri(s) + ';');
}
module.exports = { bild, uri, bana, BILDER, B, H, TAK };
