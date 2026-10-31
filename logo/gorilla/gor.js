// Exporterar gorilla-loggan (B = med AD-lapp, A = utan, för små ikoner) som statiska SVG:er.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../nya/gorilla.html', 'utf8');
const js = html.split('<script>')[1].split('const g=document')[0];
const { IDEER, ritaSVG } = new Function(js + 'return {IDEER, ritaSVG};')();
const ST = +(process.argv[2] || 1);
fs.writeFileSync(__dirname + '/b.raw.svg', ritaSVG(IDEER[1].lager(), ST, 0, false));
fs.writeFileSync(__dirname + '/a.raw.svg', ritaSVG(IDEER[0].lager(), ST, 0, false));
