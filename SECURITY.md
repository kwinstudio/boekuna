# Security

- Geen secrets in repository.
- `AUTH_SECRET` is minimaal 32 tekens en op Render gegenereerd.
- Wachtwoorden: bcrypt cost 12.
- Sessies: HTTP-only, SameSite=Lax, Secure in production.
- Muterende API-routes vereisen een server-side session + role check.
- Tenant-ID komt uitsluitend uit de sessie.
- SQL gebruikt parameters, geen string-concatenatie voor user input.
- Security headers via Next config.
- Audit log op kernmutaties.

Nog voor brede commerciële livegang:
rate limiting, CSRF review voor formulierflows, password reset/e-mailverify, MFA/SSO, upload malware scanning, pentest, RLS defense-in-depth en volledige OWASP regression suite.
