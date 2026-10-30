# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's [private vulnerability reporting](https://github.com/northcrafto/adraze/security/advisories/new) instead.

Relevant examples:

- A page can detect, disable or bypass AdRaze's popup guard to open malicious windows.
- A page can read data from the extension or trigger privileged actions through its messaging.
- A malicious site is allowed through the stop page, or a safe site is consistently sent to it.

We aim to reply within a week.

## Browser security model

These are the guarantees the AdRaze browser is built to keep. Breaking any of them is a vulnerability we want to hear about.

- **Sandboxed pages.** Every renderer runs in Chromium's sandbox (`app.enableSandbox()`, user namespaces and seccomp on Linux), with context isolation and no Node.js. The sandbox is turned off only on systems that forbid it (Ubuntu 24.04+ without the AppArmor rule that the installer offers to add).
- **The main process trusts no page.** Every IPC channel is checked against the sending frame (`main.js`, IPC guard). Web pages reach only the few channels their preload needs; passwords and cards are looked up by the frame's real origin, never by what the page sends; card autofill works only on HTTPS pages.
- **Internal pages stay internal.** Web pages cannot navigate to, open or frame `adraze://` pages or local files.
- **Local network protection.** A site on the internet cannot reach `localhost`, the router or other private addresses (`natskydd.js`), apart from sites on Brave's exception list.
- **No silent app launches.** Opening another program from a link always asks; dangerous protocols (`file:`, `smb:`, `ms-msdt:` …) are refused. USB, serial, HID and other device APIs are denied.
- **Hardened binary.** Electron fuses disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, only load the app from `app.asar`, and encrypt cookies on disk.
- **Up-to-date engine.** An automated watcher checks every two hours for a newer Electron build with Widevine (castlabs), builds it, and releases it once the security and package test suites pass. Users get it through the in-app updater within about half an hour. New major versions are adopted the same way after three days. Every release, manual or automatic, is tested exactly as shipped, including that the previous release's profile and cookies still work.

## Supported versions

Only the latest release receives fixes.
