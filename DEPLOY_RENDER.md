# Deploy op Render

## Huidige resources

- Webservice: `workforce-os`
- Postgres: `workforce-os-postgres`
- Regio: Frankfurt
- Productie-URL: `https://workforce-os-augn.onrender.com`

## Volledig via Blueprint

1. Open Render > New > Blueprint en selecteer deze repository/branch.
2. Laat `render.yaml` de webservice en Postgres koppelen.
3. `DATABASE_URL` gebruikt `fromDatabase.connectionString`, dus geen databasewachtwoord hoort in Git.
4. De build voert lint, typecheck, 100 core tests, veilige migrations en `next build` uit.
5. Controleer `/api/health` na deploy.
6. Registreer daarna de eerste organisatie via `/register`.

## Bestaande handmatig aangemaakte webservice koppelen

De gebruikte Render-connector kan gevoelige Postgres connection details niet uitlezen. Als de bestaande webservice niet via Blueprint wordt gesynchroniseerd:

1. Open in Render de database `workforce-os-postgres`.
2. Open **Connect** en kopieer de **Internal Database URL**.
3. Open webservice `workforce-os` > **Environment**.
4. Voeg `DATABASE_URL` toe met die interne URL.
5. Kies **Save, rebuild, and deploy**.
6. De build ziet `DATABASE_URL` en voert automatisch de non-destructive SQL migrations uit.
7. Controleer dat `/api/health` HTTP 200 met `{"status":"ok"}` teruggeeft.
8. Registreer een eigenaar via `/register` en test database writes.

Gebruik voor Render-to-Render verkeer de interne database-URL, niet de externe URL.

## Demo seed

Demo data is optioneel en nooit vereist voor productie. Alleen expliciet uitvoeren met:

`npm run db:seed`

De webserver gebruikt Render's `PORT` via `next start -H 0.0.0.0 -p $PORT`.
