// Ritar N "kokande" bildrutor av gorilla B (samma ritkod som skisserna) -> f<N>.raw.svg
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../nya/gorilla.html', 'utf8');
const js = html.split('<script>')[1].split('const g=document')[0];
const { IDEER, ritaSVG } = new Function(js + 'return {IDEER, ritaSVG};')();
for (let st = 1; st <= 4; st++) fs.writeFileSync(`${__dirname}/f${st}.raw.svg`, ritaSVG(IDEER[1].lager(), st * 3, 0, false));
