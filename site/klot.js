// Jordklotet: cobe (liten WebGL-glob). Snurrar långsamt, går att dra, pausas när det inte syns.
import createGlobe from 'https://cdn.jsdelivr.net/npm/cobe@0.6.3/+esm';

const canvas = document.getElementById('klot');
if (canvas) {
  const STADER = [
    [59.33, 18.07, 0.14], [57.71, 11.97], [55.6, 13.0], [56.24, 12.86], [63.83, 20.26], // Sverige
    [59.91, 10.75], [55.68, 12.57], [60.17, 24.94], [52.52, 13.4], [51.51, -0.13], [48.86, 2.35], [40.42, -3.7],
    [41.9, 12.5], [52.37, 4.9], [40.71, -74.0], [34.05, -118.24], [43.65, -79.38], [-23.55, -46.63], [19.43, -99.13],
    [35.68, 139.69], [37.57, 126.98], [1.35, 103.82], [28.61, 77.21], [25.2, 55.27], [-33.87, 151.21], [30.04, 31.24], [-26.2, 28.05], [41.01, 28.98],
  ].map(([lat, lng, size]) => ({ location: [lat, lng], size: size || 0.06 }));

  const dpr = Math.min(devicePixelRatio, 2);
  const stilla = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let phi = 4.6, drag = null, fart = 0, synlig = true, bredd = 0;
  const matt = () => (bredd = canvas.offsetWidth);
  addEventListener('resize', matt); matt();

  const globe = createGlobe(canvas, {
    devicePixelRatio: dpr,
    width: bredd * dpr, height: bredd * dpr,
    phi, theta: 0.32, dark: 1, diffuse: 3, mapSamples: 22000, mapBrightness: 14, mapBaseBrightness: 0.06,
    baseColor: [0.75, 0.75, 0.78], markerColor: [1, 0.36, 0.15], glowColor: [0.35, 0.35, 0.38],
    markers: STADER,
    onRender(state) {
      if (!drag && synlig && !stilla) phi += 0.0035;
      phi += fart; fart *= 0.92;
      state.phi = phi;
      state.width = bredd * dpr; state.height = bredd * dpr;
    },
  });
  requestAnimationFrame(() => canvas.classList.add('klar'));

  // Dra med mus eller finger (vågrätt); lodrätt finger-svep scrollar sidan som vanligt
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, phi }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const ny = drag.phi + (e.clientX - drag.x) / 160;
    fart = (ny - phi) * 0.25; phi = ny;
  });
  const slapp = () => { drag = null; };
  canvas.addEventListener('pointerup', slapp);
  canvas.addEventListener('pointercancel', slapp);

  // Rita inte när klotet är utanför skärmen
  new IntersectionObserver(([e]) => { synlig = e.isIntersecting; globe.toggle?.(e.isIntersecting); }).observe(canvas);
}
