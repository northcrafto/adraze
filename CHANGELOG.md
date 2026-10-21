# Changelog

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
