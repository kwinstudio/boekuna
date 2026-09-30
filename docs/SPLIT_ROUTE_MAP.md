# BOEKUNA Split Route Map

Status: inventory baseline; update before cutover.

| Current host/path | Type | Current behavior | Target host/path | Redirect? | SEO/Auth impact | Owner |
|---|---|---|---|---|---|---|
| boekuna-boekhouding.onrender.com/ | mixed marketing+app | Render copies `kwinest/index.html` over `public/index.html` | boekuna.nl/ | yes after cutover | canonical/SEO critical | marketing |
| boekuna-boekhouding.onrender.com/?login=1 | auth entry | login in combined document | app.boekuna.nl/?login=1 (compat) or app root auth | yes | auth critical | app/auth |
| boekuna-boekhouding.onrender.com/?register=1 | auth entry | registration in combined document | app.boekuna.nl/?register=1 | yes | auth critical | app/auth |
| boekuna-boekhouding.onrender.com/?login=1&plan=boekuna | billing entry | auth then Boekuna plan | app.boekuna.nl/?login=1&plan=boekuna | yes | billing critical | billing |
| boekuna-boekhouding.onrender.com/?login=1&billing=success&session_id=... | billing callback | Stripe return | app.boekuna.nl/?login=1&billing=success&session_id=... | controlled | billing critical | billing |
| boekuna-boekhouding.onrender.com/?login=1&billing=cancelled | billing callback | Stripe cancel return | app.boekuna.nl/?login=1&billing=cancelled | controlled | billing | billing |
| boekuna-boekhouding.onrender.com/?login=1&billing=portal-return | billing callback | Stripe portal return | app.boekuna.nl/?login=1&billing=portal-return | controlled | billing | billing |
| boekuna-boekhouding.onrender.com/functies/ | marketing | public static page | boekuna.nl/functies/ | preserve | canonical update | marketing |
| /hoe-het-werkt/ | marketing | public static page | boekuna.nl/hoe-het-werkt/ | preserve | canonical update | marketing |
| /prijzen/ | marketing/billing CTA | public pricing | boekuna.nl/prijzen/ | preserve | CTA becomes cross-origin | marketing |
| /faq/ | marketing | public static page | boekuna.nl/faq/ | preserve | canonical update | marketing |
| /contact/ | public | contact page | boekuna.nl/contact/ | preserve | canonical update | marketing |
| /support/ | public/support | support form + email | boekuna.nl/support/ | preserve | Google Play/public URL | support |
| /privacy/ | legal | privacy | boekuna.nl/privacy/ | preserve | Google Play/public URL | legal |
| /voorwaarden/ | legal | terms | boekuna.nl/voorwaarden/ | preserve | canonical update | legal |
| /account-verwijderen/ | legal/account operation | public deletion request | boekuna.nl/account-verwijderen/ | preserve | Google Play/public URL | security/support |
| /facturen/ | marketing | product feature page | boekuna.nl/facturen/ | preserve | CTA to app host | marketing |
| /scanner/ | marketing | scanner feature page | boekuna.nl/scanner/ | preserve | CTA to app host | marketing |
| /btw-bank/ | marketing | VAT/bank feature page | boekuna.nl/btw-bank/ | preserve | CTA to app host | marketing |
| /rapportages/ | marketing | reports feature page | boekuna.nl/rapportages/ | preserve | CTA to app host | marketing |
| /over/ | marketing | about | boekuna.nl/over/ | preserve | canonical update | marketing |
| /veiligheid/ | marketing/security | security information | boekuna.nl/veiligheid/ | preserve | canonical update | security |
| /voor-ondernemers/ | marketing | audience page | boekuna.nl/voor-ondernemers/ | preserve | canonical update | marketing |

## App internal navigation
The current product uses a single HTML application with client-side page state rather than separate server routes. Known app pages include dashboard, invoices, expenses, bank, VAT, reports, ledger/control/cashflow, bookings, contacts, services, hours, documents, profile/settings. These should remain inside the app origin and should not become SEO-indexed marketing routes.

## Auth/callback inventory still to verify before cutover
- Supabase email confirmation callback URL.
- Supabase password recovery callback URL.
- OAuth provider callback/deep links if enabled.
- Preview-host redirect URLs.
- PWA `start_url` currently `/?login=1&app=1`.
- Exact production custom-domain mapping for `boekuna.nl`, `www.boekuna.nl`, and future `app.boekuna.nl`.
