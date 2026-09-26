# ENVIRONMENT

## Vereist
- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — minimaal 32 random tekens.

## Aanbevolen
- `APP_URL` — publieke basis-URL.

## Alleen demo/ontwikkeling
- `DEMO_ADMIN_EMAIL`
- `DEMO_ADMIN_PASSWORD`
- `SEED_DEMO`

Geen echte waarden horen in Git. Render zet secrets als environment variables.
