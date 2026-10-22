// Renderar butiksbilderna i store/bilder.html till store/*.png (node store/rendera.cjs)
const { chromium } = require("../tools/node_modules/playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  await p.goto("file://" + path.join(__dirname, "bilder.html")); await p.evaluate(() => document.fonts.ready);
  for (const [id, namn] of [["s1", "skarmdump-1"], ["s2", "skarmdump-2"], ["s3", "skarmdump-3"], ["tile", "kampanj-liten-440x280"], ["marquee", "kampanj-stor-1400x560"]])
    await (await p.$("#" + id)).screenshot({ path: path.join(__dirname, namn + ".png") });
  await b.close();
})();
