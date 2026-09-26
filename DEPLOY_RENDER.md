# Deploy op Render

1. Push deze repository naar GitHub/GitLab/Bitbucket.
2. Controleer `render.yaml`.
3. Open Render > New > Blueprint en selecteer de repository.
4. Vul tijdens de eerste Blueprint-run:
   - `APP_URL` (na eerste deploy aanpassen naar de onrender.com URL)
   - optioneel `DEMO_ADMIN_EMAIL`
   - optioneel `DEMO_ADMIN_PASSWORD`
5. Render maakt in Frankfurt:
   - web service `workforce-os`
   - PostgreSQL `workforce-os-postgres`
6. Build draait migrations vóór `next build`.
7. Health check: `/api/health`.
8. Seed demo alleen handmatig: `npm run db:seed`.
9. Controleer login, database-write, planner drag/drop, forecast en `/api/health`.
10. Voeg pas daarna een custom domain toe.

De webserver gebruikt Render's `PORT` via `next start -p $PORT` en luistert op `0.0.0.0`.
