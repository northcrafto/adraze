#!/usr/bin/env node
// Har en Windows-fil (PE) en Authenticode-signatur? Läser certifikattabellen i PE-huvudet.
// Avslutar 0 = signerad, 1 = osignerad/inte PE. Giltigheten kontrolleras av signeringsverktyget, inte här.
const fs = require('fs');
try {
  const b = fs.readFileSync(process.argv[2]);
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0') process.exit(1);
  const opt = pe + 24, magic = b.readUInt16LE(opt);
  const dd = opt + (magic === 0x20b ? 112 : 96);   // PE32+ : PE32
  const storlek = b.readUInt32LE(dd + 4 * 8 + 4);  // katalog 4 = certifikattabellen
  process.exit(storlek > 0 ? 0 : 1);
} catch { process.exit(1); }
