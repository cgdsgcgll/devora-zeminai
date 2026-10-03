# Authentication, roles and ownership

Validated locally on 4 October 2026, branch `feat/auth-roles`, based on main `09c6c40`.
This is a controlled-demo implementation, not a production security certification.

## Accounts and sessions

Two roles: `candidate` and `institution`. Registration requires display name
(candidate name or institution name), email, role and a 12–128 character password.
No composition rules. Email is stripped, casefolded, and protected by a unique
normalized-email index. Passwords are hashed with Argon2id using argon2-cffi
defaults and random salts; successful login rehashes when parameters change.
Missing-account login runs the same password verifier against a dummy hash.
Login failures use the same message for unknown email, wrong password and disabled accounts.

Sessions use 32 cryptographically random bytes (256 bits), URL-safe encoded.
Only SHA-256 of the high-entropy token is stored in DB; raw token exists only
in the HttpOnly cookie. Password hashing and token hashing serve different purposes.
No token is returned in JSON, logged or stored in local/sessionStorage.
The default absolute lifetime is 604800 seconds (7 days), configurable by
`SESSION_TTL`. Login rotates/revokes the current cookie session. Logout revokes
the DB session and deletes the cookie; expiry, revocation, malformed tokens and
disabled users are rejected. There is no rolling expiry or fake refresh token.

Cookie: `SESSION_COOKIE_NAME=zeminai_session`, Path=/, HttpOnly, SameSite=Lax,
host-only (no Domain). `SESSION_COOKIE_SECURE` defaults to true.
The example explicitly sets false for local HTTP only. HTTPS deployments must
set true, terminate TLS correctly and review proxy trust.

References:
[argon2-cffi API](https://argon2-cffi.readthedocs.io/en/stable/api.html),
[OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Browser transport and CSRF

Frontend always calls relative `/api` with `credentials: include`. Next rewrites
proxy to the server-only `API_BACKEND_URL` (default http://127.0.0.1:8000).
Thus a browser at localhost uses a localhost host-only cookie while the backend
runs on 127.0.0.1. Direct cross-site localhost → 127.0.0.1 requests would not
reliably send SameSite=Lax cookies; do not restore the old public API-base URL.

Every state-changing route, including login/register/logout, requires an exact
allowlisted Origin, or an allowlisted origin parsed from Referer when Origin
is absent. Missing origins, null origins, suffix matches and other sites fail
with 403 / CSRF_ORIGIN_REJECTED. CLI clients must send an allowed Origin too.
SameSite and CORS are defense in depth, not replacements for authorization.
CORS allows credentials with explicit origins only. All API responses have
Cache-Control: no-store. The reverse proxy must preserve the browser Origin.
No wildcard origins or trust of arbitrary X-Forwarded headers is introduced.

See [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
An XSS compromise can still act as the user; HttpOnly does not prevent that.

## Authorization matrix (all current routes)

| Route | Access |
| --- | --- |
| GET /health | Public |
| POST /auth/register, /auth/login | Public, Origin check + DB attempt budget |
| POST /auth/logout | Idempotent, Origin check; revokes supplied session |
| GET /auth/me | Authenticated active user |
| /docs, /redoc, /openapi.json | Public API documentation, no account records |
| POST /candidates | Candidate; own profile only, 409 if one already exists |
| GET/PATCH /candidates/{id} | Candidate owner |
| GET /candidates/{id}/living-profile | Candidate owner |
| GET/POST /candidates/{id}/projects | Candidate owner |
| GET/POST /candidates/{id}/profile-evidence | Candidate owner |
| GET/PATCH/DELETE /profile-evidence/{id} | Owner through candidate |
| GET /projects/{id}, POST /projects/{id}/analyze, GET /projects/{id}/evidence | Owner through candidate |
| GET /snapshots/{id}, /evidence/{id} | Owner through project/candidate |
| GET /analysis-runs/{id} | Project owner candidate or need owner institution |
| GET/POST /needs | Institution; list/create own needs |
| GET/PATCH /needs/{id} | Institution owner; PATCH updates role/output metadata |
| GET /needs/{id}/discovery | Institution owner of need |
| POST /needs/{id}/team-coverage | Institution owner of need |
| POST /matches | Institution owner of need; active owned candidate only |
| GET /matches/{id}, /matches/{id}/gaps | Institution owner through need |
| GET /matches/{id}/evidence/{evidence_id} | Institution owner of match AND evidence linked to that match |

No session: 401. Wrong role: 403. Another owner's record: 404.
Unknown UUIDs do not grant access. Reusable guards execute before workflows and
external analysis. Request validation and error envelopes remain standard.
An automated route inventory checks every business operation in OpenAPI without
a session to prevent accidental public additions.

Institution discovery is an authorized product view, not public profile access.
Candidate accounts participate in the active account discovery pool. Legacy
unowned and disabled accounts are excluded. Normal mode may show candidate names;
evidence-focused mode removes identity/free text from discovery responses but
does not promise full anonymity. Persisted matches contain their historical
evidence snapshots. Institutions cannot use direct private candidate endpoints.
Match-scoped evidence reads require actual linkage, not merely the right role.

## Ownership and migration

User creation and the 1:1 candidate profile are committed together; unique nullable
`Candidate.owner_user_id` enforces one profile per account. Institution needs
carry `owner_user_id` before the workflow's first commit, including failed analysis.
Need role/output metadata can be edited by its institution owner; criteria changes create a new need to preserve historical match references. Projects, profile evidence, snapshots, skill evidence and project runs inherit
candidate ownership. Matches and gaps inherit need ownership.

Migration `a12_auth_ownership` preserves all old rows and adds nullable owner FKs.
There is no automatic claim endpoint, arbitrary account assignment or deletion.
Legacy data stays inaccessible to normal accounts and excluded from discovery.
Any future administrative import requires a separately reviewed ownership mapping.
New HTTP-created rows cannot be ownerless. Low-level test fixtures can still seed
legacy rows deliberately.

Fresh migration, populated pre-auth upgrade, data-preserving round-trip with no
accounts, and schema check were tested on SQLite and PostgreSQL 18. Downgrade
refuses when users exist rather than silently discarding credentials/ownership.

## Frontend

/giris and /kayit use the existing visual language, accessible labels and password
autocomplete. Role selection changes the name field. Candidate lands on /profil;
institution lands on /ihtiyac. Header/navigation and route guards reflect role.
Anonymous protected routes go to /giris; wrong-role routes go to the role home.

One SessionProvider bootstraps /auth/me before protected content renders. Central
401 handling clears account/data, without repeated auth requests. Logout clears
in-memory account data. Old demo ID storage is no longer read or written.
On login/reload the latest own project/evidence or need is loaded from authorized
DB lists (bounded to 100). Existing records remain in DB. Historical matches remain
accessible through the authorized API; the MVP UI reconstructs a selection from
discovery instead of persisting match IDs in browser storage.

## Abuse protection and remaining production work

Login/register share atomic DB attempt counters per email and socket peer,
across workers. Defaults: 10/email and 60/peer in a 900-second fixed window.
All attempts, including successful requests, count. Expired buckets are cleaned
during auth requests. Identity keys are hashed; counters contain no plaintext
email/password. Tests exercise independent clients sharing the budget.

This is basic abuse protection, not a complete distributed attack defense:
fixed windows permit boundary bursts, attackers can distribute identities/IPs,
and shared proxies/NATs can cause conservative blocking. Configure trusted ingress
and ASGI forwarded-peer handling; never trust arbitrary client-forwarded IPs.
AI/GitHub endpoints still need per-user quotas, concurrency/cost budgets,
ingress limits, monitoring and alerting before public deployment.

Email verification, password recovery, MFA, account lifecycle/deletion/export,
explicit discovery participation controls, session/device management, security
event monitoring, TLS/HSTS deployment review and external security testing remain
post-hackathon / production follow-up. No fake email success screens or broken links.

## Validation

- SQLite full suite: 264 tests passed.
- PostgreSQL 18 full suite: 264 tests passed, including ownership, matching,
  discovery, migration and real-cookie authentication tests.
- Discovery query count remains bounded and constant for 1 and 12 candidates:
  10 cold SELECTs including authentication (previously 8 without auth).
- Frontend auth regressions cover role choice, login/register validation,
  both navigation variants, bootstrap, unauthorized/wrong-role routing,
  cookie credentials, logout and centralized 401 handling.
- Browser QA uses frontend localhost:3101 → proxy → backend 127.0.0.1:8102
  with an isolated PostgreSQL demo database and synthetic accounts.


### Final QA record

- Frontend: lint PASS, 37/37 tests PASS, production build PASS.
- Backend: compileall PASS, pip check PASS, PostgreSQL alembic check PASS.
- Browser: candidate registration → project → experience → logout/login →
  profile records retained; institution registration → need → discovery →
  match/gaps → logout/login → need retained; owner role/output metadata update passed without changing criteria. Wrong-role profile navigation
  returned the institution home. Mobile 390x844 and desktop 1440x900 inspected;
  no horizontal overflow observed. Real local cookie persistence was verified
  through these flows; cookie flags are asserted by backend tests.
- Browser tooling blocked navigation to raw JSON API pages. Cross-account UUID
  attacks were therefore verified with real HTTP clients against the live
  PostgreSQL API in addition to both automated suites: candidate B read/update A
  and institution B read A need/match/discovery all returned 404. No browser
  developer-tools scripting or synthetic auth bypass was used.
- git diff --check PASS. No push.
- One existing Starlette TestClient/httpx deprecation warning remains; tests pass.

The domain regression harness selects test owners with real hashed DB sessions
so pre-auth functional tests continue to exercise authorization. Security tests
use ordinary clients with fixed actors and no auth dependency overrides.
