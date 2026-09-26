# Architecture

## Kern
- Next.js 16.3.6 App Router / Node runtime
- PostgreSQL 18 op Render
- server-side tenant filtering op `organisation_id`
- HTTP-only JWT sessie met `jose`
- bcrypt wachtwoordhashing
- audit log voor mutaties
- deterministische planning core in `src/lib/scheduler-core.mjs`

## Scheduler
De scheduler scheidt:
forecast -> workload -> requirements -> employee assignment.

Hard constraints blokkeren kandidaten. Soft scores sturen de keuze. De drie strategieën veranderen de gewichten, niet de harde regels.

De huidige MVP gebruikt een deterministische scorer. Voor grotere klanten kan dezelfde interface achter een private OR-Tools service worden geplaatst zonder UI of datamodel te herschrijven.

## Tenant isolation
Elke operationele tabel bevat `organisation_id`. API-routes halen de tenant uit de geverifieerde sessie en nemen nooit een tenant-ID van de client over.

## Data
Tijdstippen staan als `timestamptz`. Organisaties en locaties bewaren de IANA-timezone. Nederlandse default: `Europe/Amsterdam`.
