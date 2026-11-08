// Heron i 3D: den handritade gorillan som ett tjockt klistermärke som slukar reklamlappar.
// Lapparna svävar runt gorillan, en i taget flyger in i käften och sprängs i papperssmulor.
// Scenen följer musen, pausas när den inte syns och står still vid "minska rörelser".
// Gorillabilden (img) syns tills 3D-scenen har ritat sin första hela bild med texturerna laddade,
// så heron blir aldrig en tom/vit platta om WebGL eller bilderna strular.
import * as THREE from '/vendor/three.module.js';

const wrap = document.querySelector('.hero-3d');
const canvas = wrap && wrap.querySelector('canvas');
const raknare = wrap && wrap.querySelector('[data-raknare]');
const stilla = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try { renderer = canvas && new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { renderer = null; }
if (!renderer) { if (wrap) wrap.classList.add('utan-3d'); } else start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.2, 11);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(3, 5, 7); scene.add(sol);
  const glod = new THREE.PointLight(0xff4b1f, 18, 12); glod.position.set(-2.5, -1, 3); scene.add(glod);

  // ---------- gorillan: framsida + 16 mörkare lager bakom = tjocklek ----------
  // Bilderna packas upp helt (decode) och laddas upp till grafikkortet (initTexture) INNAN gorillan visas.
  // Annars kunde första bilderna ritas medan texturen ännu inte fanns i grafikkortet = en vit platta i några sekunder.
  let klar = false;
  const rutor = [1, 2, 3, 4].map(() => { const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
  Promise.all(rutor.map(async (t, i) => {
    const img = new Image(); img.src = `/bilder/gorilla/g${i + 1}.png`;
    await img.decode();
    t.image = img; t.needsUpdate = true; renderer.initTexture(t);
  })).then(() => {
    // två bildrutor till innan scenen tonas in, så uppladdningen garanterat är klar
    requestAnimationFrame(() => requestAnimationFrame(() => { klar = true; gorilla.visible = true; if (stilla) rita(0); }));
  }).catch(() => { wrap.classList.add('utan-3d'); });
  const gorilla = new THREE.Group(); gorilla.visible = false; scene.add(gorilla);
  const STL = 4.1, plan = new THREE.PlaneGeometry(STL, STL);
  const lager = [];
  for (let i = 16; i >= 0; i--) {
    const fram = i === 0;
    const m = new THREE.MeshBasicMaterial({ map: rutor[0], alphaTest: fram ? 0.02 : 0.5, transparent: fram, depthWrite: !fram, color: fram ? 0xffffff : new THREE.Color().setHSL(0.03, 0.85, 0.30 - i * 0.008) });
    const mesh = new THREE.Mesh(plan, m); mesh.position.z = -i * 0.017; gorilla.add(mesh); lager.push(m);
  }
  // mjuk skugga under
  const sk = document.createElement('canvas'); sk.width = sk.height = 128;
  const skc = sk.getContext('2d'); const gr = skc.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(27,25,22,.28)'); gr.addColorStop(1, 'rgba(27,25,22,0)'); skc.fillStyle = gr; skc.fillRect(0, 0, 128, 128);
  const skugga = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sk), transparent: true, depthWrite: false }));
  skugga.position.set(0, -2.75, -0.6); skugga.rotation.x = -Math.PI / 2.4; scene.add(skugga);

  // ---------- reklamlapparna ----------
  const ANNONSER = [['YOU WON!', '#ffd23e'], ['BUY NOW', '#f7a8c4'], ['50% OFF', '#9fd3c7'], ['CLICK HERE', '#ffd23e'],
    ['VIRUS FOUND!', '#ff8e72'], ['FREE $$$', '#c7b8f5'], ['HOT OFFER', '#ffd23e'], ['LIMITED DEAL', '#f7a8c4']];
  function lappTextur(txt, farg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = farg; x.strokeStyle = '#1b1916'; x.lineWidth = 14; x.lineJoin = 'round';
    x.beginPath(); x.roundRect(10, 10, 492, 236, 26); x.fill(); x.stroke();
    x.fillStyle = '#1b1916'; x.font = `900 ${txt.length > 9 ? 70 : 88}px "Familjen Grotesk", system-ui, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 256, 136);
    x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.moveTo(452, 38); x.lineTo(478, 64); x.moveTo(478, 38); x.lineTo(452, 64); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const lappForm = new THREE.BoxGeometry(1.7, 0.85, 0.07);
  const lappar = ANNONSER.map(([txt, farg], i) => {
    const kant = new THREE.MeshStandardMaterial({ color: farg, roughness: 0.7 });
    const mesh = new THREE.Mesh(lappForm, [kant, kant, kant, kant, new THREE.MeshStandardMaterial({ map: lappTextur(txt, farg), roughness: 0.55 }), kant]);
    scene.add(mesh);
    const l = { mesh, farg: new THREE.Color(farg), vinkel: (i / ANNONSER.length) * Math.PI * 2, radie: 2.75 + (i % 3) * 0.35,
      hojd: ((i * 37) % 7) / 7 * 3.0 - 1.5, fart: 0.16 + (i % 4) * 0.035, snurr: (i % 2 ? 1 : -1) * (0.3 + (i % 3) * 0.15),
      lage: 'bana', t: 0, fran: new THREE.Vector3() };
    placera(l, 0); return l;
  });
  function banaPos(l, tid, ut) {
    const v = l.vinkel + tid * l.fart;
    return ut.set(Math.cos(v) * l.radie, l.hojd + Math.sin(tid * 0.9 + l.vinkel * 3) * 0.18, Math.sin(v) * l.radie * 0.95 - 0.3);
  }
  function placera(l, tid) {
    banaPos(l, tid, l.mesh.position);
    l.mesh.rotation.set(Math.sin(tid * 0.7 + l.vinkel) * 0.25, Math.sin(tid * 0.5 + l.vinkel) * 0.5 + l.snurr * 0.3, Math.sin(tid * 0.6 + l.vinkel * 2) * 0.2);
    l.mesh.scale.setScalar(1);
  }

  // ---------- papperssmulor ----------
  const smulForm = new THREE.PlaneGeometry(0.13, 0.09);
  const smulor = Array.from({ length: 70 }, () => {
    const m = new THREE.Mesh(smulForm, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }));
    m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), r: new THREE.Vector3(), liv: 0 };
  });
  let nastaSmula = 0;
  function spräng(pos, farg) {
    for (let i = 0; i < 22; i++) {
      const s = smulor[nastaSmula++ % smulor.length];
      s.m.visible = true; s.m.position.copy(pos); s.m.material.color.copy(i % 4 === 0 ? new THREE.Color(0x1b1916) : farg);
      s.v.set((Math.random() - 0.5) * 5, Math.random() * 3.2 + 0.6, Math.random() * 2.4);
      s.r.set(Math.random() * 9, Math.random() * 9, Math.random() * 9); s.liv = 1;
    }
  }

  // ---------- mus ----------
  const mus = { x: 0, y: 0 }, mjuk = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { const r = wrap.getBoundingClientRect();
    mus.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.8)));
    mus.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.8))); }, { passive: true });

  // ---------- storlek ----------
  function storlek() {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.z = w < 560 ? 14.5 : 12; camera.updateProjectionMatrix();
  }
  new ResizeObserver(storlek).observe(wrap); storlek();

  // ---------- loopen ----------
  const MUN = new THREE.Vector3(0, -0.92, 0.35), tmp = new THREE.Vector3();
  let atna = 0, nastaTugg = 1.4, tugg = 0, forraRuta = -1;
  const ease = (x) => x * x * (3 - 2 * x);
  function rita(tid, dt = 0) {
    // kokande bläck: byt bildruta ~9 ggr/s
    const ruta = stilla ? 0 : Math.floor(tid / 0.11) % 4;
    if (ruta !== forraRuta) { lager.forEach((m) => { m.map = rutor[ruta]; }); forraRuta = ruta; }
    mjuk.x += (mus.x - mjuk.x) * Math.min(1, dt * 4); mjuk.y += (mus.y - mjuk.y) * Math.min(1, dt * 4);
    tugg = Math.max(0, tugg - dt * 3.2);
    const k = Math.sin((1 - tugg) * Math.PI * 3) * tugg;
    gorilla.rotation.set(mjuk.y * 0.28 + Math.sin(tid * 0.8) * 0.04, mjuk.x * 0.5 + Math.sin(tid * 0.55) * 0.08, k * 0.12);
    gorilla.position.y = Math.sin(tid * 1.1) * 0.1;
    gorilla.scale.setScalar(1 + k * 0.07 + tugg * 0.04);
    skugga.scale.setScalar(1 - Math.sin(tid * 1.1) * 0.05);
    camera.position.x = mjuk.x * 0.6; camera.position.y = 0.2 - mjuk.y * 0.4; camera.lookAt(0, 0, 0);

    // välj nästa lapp att äta: den som ligger närmast framför gorillan
    if (!stilla && tid > nastaTugg) {
      const fria = lappar.filter((l) => l.lage === 'bana');
      if (fria.length) {
        const l = fria.reduce((a, b) => (b.mesh.position.z > a.mesh.position.z ? b : a));
        l.lage = 'ats'; l.t = 0; l.fran.copy(l.mesh.position);
      }
      nastaTugg = tid + 1.5 + ((atna * 7) % 5) * 0.12;
    }
    for (const l of lappar) {
      if (l.lage === 'bana') { placera(l, tid); continue; }
      l.t += dt;
      if (l.lage === 'ats') {
        const p = Math.min(1, l.t / 0.75), e = p * p * p;
        const mal = tmp.copy(MUN).applyMatrix4(gorilla.matrixWorld);
        l.mesh.position.lerpVectors(l.fran, mal, e); l.mesh.position.y += Math.sin(p * Math.PI) * 0.6;
        l.mesh.rotation.z += dt * 9; l.mesh.rotation.y += dt * 4; l.mesh.scale.setScalar(1 - e * 0.85);
        if (p >= 1) {
          spräng(mal, l.farg); tugg = 1; atna++; if (raknare) raknare.textContent = atna.toLocaleString(document.documentElement.lang || 'sv');
          l.lage = 'in'; l.t = 0; l.vinkel = Math.random() * Math.PI * 2 - tid * l.fart;
          l.fran.set((Math.random() < 0.5 ? -1 : 1) * 9, (Math.random() - 0.5) * 6, -3);
        }
      } else if (l.lage === 'in') {
        const p = Math.min(1, l.t / 1.1), e = ease(p);
        banaPos(l, tid, tmp); l.mesh.position.lerpVectors(l.fran, tmp, e);
        l.mesh.rotation.z = (1 - e) * 2; l.mesh.scale.setScalar(0.4 + e * 0.6);
        if (p >= 1) l.lage = 'bana';
      }
    }
    for (const s of smulor) {
      if (!s.m.visible) continue;
      s.liv -= dt * 1.1; if (s.liv <= 0) { s.m.visible = false; continue; }
      s.v.y -= dt * 7; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.r.x * dt; s.m.rotation.y += s.r.y * dt; s.m.material.opacity = Math.min(1, s.liv * 2);
    }
    renderer.render(scene, camera);
    if (klar && !wrap.classList.contains('klar')) requestAnimationFrame(() => wrap.classList.add('klar'));
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); wrap.classList.remove('klar'); });
  canvas.addEventListener('webglcontextrestored', () => { forraRuta = -1; });

  if (stilla) { rita(0); return; }
  let synlig = true, forra = performance.now(), tid = 0;
  new IntersectionObserver(([e]) => { synlig = e.isIntersecting; }).observe(wrap);
  renderer.setAnimationLoop((nu) => {
    const dt = Math.min(0.05, (nu - forra) / 1000); forra = nu;
    if (!synlig || document.hidden) return;
    tid += dt; rita(tid, dt);
  });
}
