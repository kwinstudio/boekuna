# Workforce OS — WFM SaaS

Een echte eerste productiecodebase voor hospitality workforce management.

## Wat deze versie al doet
- e-mail/wachtwoord registratie en login
- multi-tenant organisaties en memberships
- locaties en functies
- medewerkers + contracturen + uurloon
- dashboard met omzet/uren/loonkosten
- omzetforecast met onzekerheidsband
- drie deterministische scheduler-strategieën: cost / balanced / service
- explainability per automatisch geplande assignment
- drag/drop planner met overlapcontrole
- verlofaanvragen
- klokterminal met in-/uitklokken
- audit logging
- PostgreSQL migrations
- Render Blueprint + health endpoint
- responsive manager UI/PWA manifest

## Nog niet voltooid
De masterprompt is groter dan een enkel MVP. Nog te bouwen voor volledige acceptance:
open-shift claim UI, ruilflow, availability-patterns, certificaten, skills UI, employee-invite/employee-only PWA, urenapproval, imports/exports, notificatiekanalen, uitgebreide rapportages, billing, Redis/background worker, OR-Tools service, 25 volledige E2E-flows en productie-QA.

## Lokaal
1. `cp .env.example .env`
2. PostgreSQL starten en `DATABASE_URL` instellen.
3. `npm install`
4. `npm run db:migrate`
5. optioneel `npm run db:seed`
6. `npm run dev`

## Testen
`npm test`

## Deployment
Zie `DEPLOY_RENDER.md`.
