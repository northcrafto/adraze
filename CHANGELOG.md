# Changelog

## 0.2.1 (2026-10-31)

- New icon: the AdRaze eagle.
- Account page moved to accounts.adraze.app: the extension now connects to your account there too (adraze.app/konto redirects).
- YouTube's and Google's own cookie banners are rejected too.
- Fresh filter lists.
- Scriptlets, ported from the AdRaze browser: `##+js(...)` filters now run inside the page (main world, at document start, also in frames), only on the sites the filters name. 29 scriptlets with their uBlock Origin aliases: set-constant, abort-on-property-read/write, abort-current-script, abort-on-stack-trace, addEventListener-defuser, no-setTimeout-if, no-setInterval-if, adjust-setTimeout/setInterval, json-prune, remove-node-text, no-fetch-if, no-xhr-if, no-window-open-if, noeval-if, nowebrtc, remove-attr, remove-class, set-cookie, set-cookie-reload, remove-cookie, set-local-storage-item, set-session-storage-item, href-sanitizer, nofab, nobab, popads-dummy and popads.net. About 5,000 scriptlet rules on 23,000 sites, `#@#+js` exceptions are honoured. YouTube is left to AdRaze's own YouTube handling. Trusted scriptlets and response rewriting (rpnt, json-prune-fetch-response, xml-prune …) are not supported.
- Redirect stubs, ported from the AdRaze browser: `$redirect` and `$redirect-rule` filters (about 790 rules) answer with a harmless stand-in packed in the extension instead of failing: empty script, text, HTML, JSON and CSS, small transparent images, silent MP3/MP4, an empty VMAP, and no-op versions of Google AdSense, Google Publisher Tag, Google Analytics/Tag Manager, FingerprintJS 2, FuckAdBlock/BlockAdBlock, Amazon apstag, Prebid, PopAds and Chartbeat. Pages that wait for an ad or analytics script no longer break or show an anti-adblock wall. `redirect-rule` is only used where the request is blocked anyway.
- More of the lists is used: uBlock Origin's `!#include` sub-lists (filters 2020–2026, link shorteners, mobile) and `!#if` sections are read, uBlock filters – Quick fixes and Unbreak are included (without their YouTube lines), and `$to=`, `$denyallow=`, `$document`/`$all` on paths (stop page), filters that start with `$` and `~site` exclusions are converted. Conversion errors went from 660 to 184.
- Tracking parameters: `$removeparam` filters strip named tracking parameters from addresses (new `parametrar` rule set, 48 rules).
- `$important` filters now win over allow filters, as in uBlock Origin. Before, generic important filters lost to allow rules.
- DNR rules: about 17,100 → 22,487 (ads 10,250, privacy 9,071, security 3,118, parameters 48), still under Chrome's guaranteed 30,000 static rules. Regex rules: 49 → 152; Chrome's limit of 1,000 is shared by all rule sets and is now checked in total.
- Cosmetic filtering: `:style()` (about 3,700 rules on 2,900 sites), `:remove()`, `:remove-attr()`, `:remove-class()` and `:-abp-has()` are supported, `~site` on a hiding filter becomes an exception, and `#?#` filters are no longer read as plain hiding filters. Procedural filters (`:has-text()`, `:upward()` …) and HTML filters are still skipped.
- Popup guard, ported from the AdRaze browser: when a site asks "You are leaving …" and then opens the link with `window.open`, it opens, as long as you clicked a link to that site within the last minute.

## 0.2.0 (2026-10-22)

- Cookie banners: AdRaze rejects non-essential cookies by clicking "Reject all" or "Only necessary" in about 25 common consent tools (OneTrust, Cookiebot, Didomi, Sourcepoint, Usercentrics, consentmanager, CookieYes, Complianz and others), including Didomi banners where the reject button is one layer in. Banners are hidden with the EasyList Cookie List so they never flash. Banners with no free reject button ("pay or accept") are hidden and nothing is accepted; a paid reject button is never clicked. Pages that lock scrolling while the banner is open scroll again.
- Toolbar menu: a second switch turns cookie banner handling off for the current site, so you can make your own choice there. The footer also counts rejected cookie banners.
- Bait guard: sites that detect ad blockers by adding an empty "ad" (class `adsbox`, `ad-banner` and so on) and checking whether it gets hidden no longer see AdRaze. An element hidden by AdRaze's own rules is shown again only if people could not see it anyway: it is empty, draws nothing, and is off the page or at most one line tall. If it later gets content or grows, it is hidden again before it is painted. Elements the site hides itself are never touched.
- browser.lol: the session start no longer asks you to turn off your ad blocker.

## 0.1.1 (2026-10-21)

- YouTube: pre-roll and mid-roll ads are muted, hidden and skipped as soon as they start. The ad view is still reported, so the next video starts without YouTube's black waiting screen.
- YouTube: the Premium promo banner on the home page is hidden.
- Popup guard: catches click hijacks that are started from timers, bound functions and invisible overlays, and recognises many more sign-in and payment providers (BankID, Klarna, Trustly, Vipps, Apple, Microsoft and others) so they always open.
- Sign in with Google works again on sites where AdGuard Popups blocked Google Identity Services.
- Ad-funded link shorteners (Linkvertise, adf.ly) no longer trigger the stop page.
- Hides Google search ads and sponsored shopping rows, the YouTube sponsored card next to the player, and leftover ad slots on di.se, Omni, Aftonbladet, Elgiganten, CrazyGames, Softonic and Forbes.

## 0.1.0 (2026-10-19)

First public release.

- Network blocking with EasyList, EasyPrivacy, Frellwit's Swedish Filter, uBlock Origin filters, AdGuard Popups and Peter Lowe's list (about 17,000 DNR rules).
- Cosmetic filtering: generic and site-specific element hiding.
- Popup guard against popunders and invisible click traps, with sign-in and payment providers always allowed.
- Stop page for malicious sites and ad-initiated redirects; popup tabs that hit it are closed.
- Toolbar menu with per-tab counters and pause per site.
