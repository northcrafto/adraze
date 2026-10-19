# Contributing to AdRaze

Thanks for helping make the web less annoying.

## Reporting problems

Use the issue templates:

- **Broken site:** a page, video, game, login or checkout stops working with AdRaze on.
- **Missed ad or popup:** an ad, tracker, popup or redirect gets through.
- **Bug:** anything else in the extension.

Always include the exact URL and say whether the problem goes away when you pause AdRaze on that site (toolbar menu, then the switch). That tells us immediately if AdRaze is the cause.

## Development setup

```sh
cd tools
npm install
npx playwright-core install chromium
node build.js --fetch
```

Load `extension/` in `chrome://extensions` with Developer mode on. After changing code, press the reload arrow on the AdRaze card.

## Testing against real sites

`tests/harness.cjs` starts Chromium with or without the extension and records page errors, new tabs, the stop page and blocked requests. A bug only counts if the page behaves differently with and without AdRaze:

```js
const h = require('./tests/harness.cjs');
for (const ext of [false, true]) {
  const s = await h.start({ ext, namn: 'example' });
  await s.page.goto('https://example.com');
  await h.godkannCookies(s.page);
  console.log(h.sammanfatta(s));
  await s.ctx.close();
}
```

## Pull requests

- Keep changes focused. One fix per pull request.
- Don't commit generated files by hand. Change `tools/build.js` and rebuild instead.
- New allowlist or exception rules need the URL that broke and a short explanation.
- `extension/` must keep working without any network access to our own servers. AdRaze never phones home.

## License

By contributing you agree that your contribution is licensed under GPL-3.0.
