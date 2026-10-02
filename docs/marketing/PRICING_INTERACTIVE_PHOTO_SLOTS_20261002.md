# BOEKUNA marketing photo slots — 2026-10-02

Scope: public marketing website only. These slots contain no image, text, icon or fake product UI in this release.

| Route | Slot | Purpose | Desktop ratio | Mobile ratio | Future photo recommendation |
|---|---|---|---|---|---|
| `/` | Hero | Humanize the opening without replacing product truth | 4:5 | 4:5, full width below copy | Entrepreneur working with phone or laptop in a real work setting |
| `/` | Voor ondernemers | Add a second editorial human moment before audience cards | 4:3 | 4:3, full width | Natural working situation for a solo entrepreneur or small service business |

Implementation contract:
- Reusable class: `.photo-slot`.
- Current fills: Frozen Water for hero, Light Sea Green for the second slot.
- No `img` element until real photography is supplied.
- When photography is added, the existing slot becomes the image wrapper without changing surrounding layout.
- Alt text is decided only when the real photo and its informational purpose are known.

## Pricing release boundary

Public marketing announces:
- Gratis — €0 — 10 slimme documentchecks / month.
- Start — €6,95 excl. btw — 40 / month.
- Boekuna — €9,95 excl. btw — 100 / month — Meest gekozen.
- Unlimited — €14,95 excl. btw — no monthly limit.

Start, Boekuna and Unlimited are non-transactional on the public marketing cards until billing is migrated. Existing technical billing, Stripe price IDs, checkout functions, migrations and app pricing are outside this release and remain unchanged.

## 60 / 30 / 10 audit intent

White stays the dominant canvas. Frozen Water is the primary secondary surface. Light Sea Green is used more sparingly for emphasis and the second photo zone. Amber is limited to primary actions and small highlights; Honey Bronze is primarily the hover/support tone. Near Black remains the text, border, footer and focus neutral.
