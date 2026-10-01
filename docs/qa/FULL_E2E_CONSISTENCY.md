# BOEKUNA Full E2E Final Consistency Audit

Run: QA-E2E-20261001  
Source SHA: 7132029b792c8942f18317637ff352461dfe08d5

## Result

- Unique matrix TEST-IDs: 421
- Duplicate TEST-IDs: 0
- PASS: 10
- FAIL: 2
- BLOCKED: 404
- NOT_TESTED: 0
- NOT_APPLICABLE: 5
- Status sum: 421
- State ledger counters match matrix: YES
- Required QA files present: YES
- Checkpoint commits 00 through 31 present on QA branch: YES
- Confirmatory retry count for FUNC-CI-001: exactly 1
- Product code changed on QA branch: NO; branch changes are QA docs/evidence only.

## Coverage interpretation

Matrix classification coverage is 100%: every inventoried scenario has an explicit status.

Executed evidence coverage excludes BLOCKED and NOT_APPLICABLE scenarios:
`(PASS + FAIL) / (TOTAL - NOT_APPLICABLE) = 12 / 416 = 2.88%`.

This low executed coverage is caused primarily by absence of an interactive browser/computer runner in this execution environment plus the exact-current integrity workflow failing before downstream suites execute. BLOCKED is not counted as PASS or as executed functional coverage.

## Evidence integrity

The exact app deployment is tied to the frozen SHA through Render deployment metadata. The older public Render app is not used as evidence. Current CI evidence is from run 36883528292 and its single confirmatory rerun attempt. Supabase security evidence is read-only current-state metadata/advisors/policies. Historical green browser runs are not promoted to current PASS.
