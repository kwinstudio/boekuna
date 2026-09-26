# SETUP

## Vereisten
- Node.js 22
- PostgreSQL 18 of compatibel

## Installatie
```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed   # optioneel
npm run dev
```

## Checks
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Demo seed wordt nooit automatisch door productie gebruikt.
