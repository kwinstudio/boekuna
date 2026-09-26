# QA_REPORT.md

## Samenvatting

- Render build: **PASS**
- Lint: **PASS**
- Typecheck: **PASS**
- Geautomatiseerde core QA: **100 PASS / 0 FAIL**
- Next.js production build: **PASS**
- Scope: scheduler constraints/scoring, availability, overlap/nachtdiensten, forecast, workload, loonkosten en onmogelijke roostergevallen.
- Niet als PASS geclaimd: PostgreSQL-integratie, volledige browser-E2E en alle 25 end-to-end businessflows zolang DATABASE_URL nog niet aan de webservice is gekoppeld.

## Checks

### T001 — overlap 18-22 vs 18-22
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T002 — overlap 18-22 vs 17-19
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T003 — overlap 18-22 vs 21-23
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T004 — overlap 18-22 vs 19-20
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T005 — overlap 19-20 vs 18-22
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T006 — overlap 18-22 vs 22-23
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T007 — overlap 18-22 vs 17-18
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T008 — overlap 18-22 vs 23-24
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T009 — hours break 0
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T010 — hours break 30
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T011 — hours break 60
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T012 — hours break 90
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T013 — hours cross midnight
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T014 — hours cross midnight break
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T015 — hours negative clamps
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T016 — hours quarter
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T017 — hours half
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T018 — hours 90 minutes
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T019 — break equals shift
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T020 — break exceeds shift
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T021 — cross-midnight overlap
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T022 — eligible base
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T023 — blocked wrong role
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T024 — blocked wrong location
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T025 — blocked missing skill
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T026 — blocked overlap
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T027 — blocked max hours
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T028 — blocked leave
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T029 — availability covered
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T030 — availability short
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T031 — availability false
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T032 — score range balanced
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T033 — score range cost
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T034 — score range service
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T035 — cost prefers cheaper
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T036 — service prefers experience
- Pagina/module: `Scheduler/forecast core`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T037 — balanced preference match
- Pagina/module: `Scheduler/forecast core`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T038 — fairness rewards target closeness
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T039 — no skills required gives full coverage
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T040 — blocked score is minus infinity
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T041 — explain reason beschikbaar
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T042 — explain reason functie:
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T043 — explain reason fairness
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T044 — explain reason kostenfit
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T045 — max hours exact allowed
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T046 — max hours decimal over blocks
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T047 — leave touching start allowed
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T048 — existing touching start allowed
- Pagina/module: `Scheduler/forecast core`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T049 — missing specific skill named
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T050 — strategy weights differ
- Pagina/module: `Scheduler constraints/scoring`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T051 — mean basic
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T052 — mean empty
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T053 — weighted single
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T054 — weighted trend up
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T055 — stddev zero
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T056 — stddev empty
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T057 — forecast empty
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T058 — forecast positive
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T059 — forecast band order
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T060 — forecast confidence range
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T061 — forecast positive adjustment
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T062 — forecast negative adjustment
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T063 — forecast ignores negative
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T064 — forecast ignores NaN
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T065 — forecast minimum margin
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T066 — workload 950/95
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T067 — workload 1000/95
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T068 — workload 0/95
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T069 — workload 1000/0
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T070 — forecast factors exist
- Pagina/module: `Forecast/workload`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T071 — shift hours basic
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T072 — shift hours break
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T073 — shift hours overnight
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T074 — cost base
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T075 — cost employer factor
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T076 — cost surcharge
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T077 — cost break
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T078 — cost rounding
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T079 — labour percentage basic
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T080 — labour percentage decimal
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T081 — labour zero revenue
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T082 — labour over 100
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T083 — zero wage zero cost
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T084 — zero hours zero cost
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T085 — negative shift clamps
- Pagina/module: `Scheduler/forecast core`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T086 — schedule one
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T087 — schedule two slots
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T088 — schedule no employees unfilled
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T089 — schedule wrong role unfilled
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T090 — schedule cost chooses cheap
- Pagina/module: `Loonkosten/uren`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T091 — schedule service chooses experienced
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T092 — schedule avoids overlap
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T093 — schedule deterministic tie
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T094 — schedule updates hours
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T095 — schedule strategy label
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T096 — schedule reasons present
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T097 — schedule breakdown present
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T098 — schedule nonoverlap same employee
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T099 — schedule max hours leaves one
- Pagina/module: `Tijd/overlap`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

### T100 — schedule impossible does not crash
- Pagina/module: `Scheduler`
- Rol: systeem/core
- Stappen: geautomatiseerde Node.js test in de Render buildpipeline uitvoeren.
- Verwacht resultaat: domeinregel levert deterministisch het verwachte resultaat en crasht niet.
- Werkelijk resultaat: test door Render als `ok` gerapporteerd.
- Status: **PASS**

## Openstaande acceptance-tests

De 100 checks hierboven zijn echte geautomatiseerde core tests. Ze vervangen niet de afzonderlijk vereiste database-integratietests, tenant-isolation integration tests, browser-E2E, responsive browser-QA en productieflows. Die mogen pas PASS worden nadat de webservice werkelijk met PostgreSQL is verbonden.
