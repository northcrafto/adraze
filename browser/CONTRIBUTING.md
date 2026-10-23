# Contributing to AdRaze

Thanks for wanting to help. AdRaze is a small project with a big goal: a browser that protects ordinary people by default, without spying on them. Every contribution counts, whether it is a bug report, a translation fix or a new feature.

## Ways to contribute

- **Report bugs** — open an issue with the bug template. Include your OS, AdRaze version (Settings → About) and steps to reproduce.
- **Suggest features** — open an issue with the feature template. Explain the problem before the solution.
- **Improve translations** — the UI ships in 54 languages under `ui/locales/`. Swedish strings are the source keys; `tools/gen_i18n.js` regenerates the dictionaries.
- **Fix site breakage** — blocking rules live in the extension (`../extension`); fix them there and the browser picks them up with `npm run sync`.
- **Write code** — see below.

## Development setup

```bash
git clone https://github.com/northcrafto/adraze.git
cd adraze/browser
npm install          # downloads the castLabs Electron build (Widevine-enabled)
npm start            # runs the browser from source
```

Requirements: Node.js 22 or newer. The first `npm install` fetches Electron from castLabs' GitHub releases, which can take a minute.

Useful flags while developing:

- `--remote-debugging-port=9333` — attach Chrome DevTools or a CDP script to the shell and tabs.
- `ADRAZE_DEBUG=1` — log every blocked request to the terminal.
- `ADRAZE_NO_UPDATES=1` — skip the update check.

## Project layout

| Path | What it is |
| --- | --- |
| `main.js` | Electron main process: windows, tabs (WebContentsView), protection engine, downloads, updates, IPC. |
| `preload.js` | Bridge between the shell UI and the main process. |
| `content-preload.js` | Runs inside web pages: password/card detection, autofill, cosmetic filtering. |
| `scanner.js` | Dangerous-site checks and content analysis. |
| `auth.js` | Account session handling. |
| `ui/` | The browser shell (`shell.html`, `shell.js`, `input.css` → `tailwind.css`), Krypto panel, checkout, settings. |
| `adblock-adraze.js` | The AdRaze engine: network rules, cosmetic CSS, cookie banners, danger checks. |
| `adraze-preload.js` | Runs the extension's page scripts inside tabs. |
| `tools/` | Rule sync, translations, release and MSIX scripts. |
| `build/` | Icons and packaging hooks. |

The shell CSS is written in `ui/input.css` and compiled with Tailwind:

```bash
node_modules/.bin/tailwindcss -i ui/input.css -o ui/tailwind.css --minify
```

Commit the compiled `tailwind.css` together with your change.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep the change focused. One fix or feature per PR.
3. Run the browser and test the change by hand. Describe what you tested in the PR.
4. Keep the Swedish UI strings intact unless the change is about wording — the translation system matches on the exact Swedish text.
5. Do not include build output (`dist/`, `dist-installer/`) or backup files.

Small, well-described PRs get merged fast. Large rewrites should start as an issue so we can agree on the direction first.

## Code style

- Plain JavaScript, no build step for the main process.
- Two-space indentation, single quotes, semicolons.
- Comments in the code are written in Swedish, matching the existing codebase. Commit messages and PR descriptions can be in Swedish or English.
- Prefer small, readable functions over clever ones. This is security software; clarity beats brevity.

## Security

If your contribution touches the protection engine, the password manager, the wallet or account handling, say so in the PR so it gets an extra pair of eyes. Never post a vulnerability in a public issue — see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [Mozilla Public License 2.0](LICENSE), the same license as the project.
