// Laddar E2E-kärnan (Rust + vodozemac kompilerat till wasm, se ../../e2e-karna) i Node eller Electrons
// huvudprocess. Samma kärna som iPhone-appen använder, så formatet på tråden är detsamma.
//
// Hela gränssnittet är anropa({op, …}) → {ok, …}. Slumpen kommer från crypto.getRandomValues.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

let instans = null;

function ladda() {
  if (instans) return instans;
  const bytes = fs.readFileSync(path.join(__dirname, 'karna.wasm'));
  let minne = null;
  const imports = {
    adraze: {
      // getRandomValues tar högst 65 536 byte åt gången
      slump(p, n) {
        for (let i = 0; i < n; i += 65536) webcrypto.getRandomValues(new Uint8Array(minne.buffer, p + i, Math.min(65536, n - i)));
      },
    },
  };
  const modul = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(modul, imports);
  minne = inst.exports.memory;
  instans = inst.exports;
  return instans;
}

const kod = new TextEncoder();
const avkod = new TextDecoder('utf-8', { fatal: true });

// Ett anrop till kärnan. Indata och svar nollas i wasm-minnet efteråt (svaret kan innehålla återställningskoden).
function anropa(fraga) {
  const ex = ladda();
  const ind = kod.encode(JSON.stringify(fraga));
  const p = ex.adraze_minne(ind.length);
  new Uint8Array(ex.memory.buffer, p, ind.length).set(ind);
  ind.fill(0);
  let text;
  try {
    const n = ex.adraze_anropa(p, ind.length);
    const r = ex.adraze_resultat();
    text = avkod.decode(new Uint8Array(ex.memory.buffer, r, n).slice());
  } finally {
    ex.adraze_slapp(p, ind.length);
    ex.adraze_rensa();
  }
  return JSON.parse(text);
}

module.exports = { anropa };
