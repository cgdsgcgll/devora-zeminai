# Grounding repair validation

Validated locally on 2026-10-01, on `feat/living-talent-profile`.

## Cause and scope

The reported project error is raised after schema, source path/type and exact
excerpt checks, when the skill is not supported by the excerpt. The original
live response is unavailable: hallucination versus an unrecognized alias cannot
be conclusively distinguished. No project grounding condition was relaxed.

Need analysis previously excluded OSPF and Packet Tracer from its technical
catalog, and its prompt did not enumerate that catalog. Even an exact supporting
quote could therefore be rejected. These two technologies are now supported;
Cisco Packet Tracer and Packet Tracer share the `packet-tracer` canonical key.
An exact source excerpt and explicit lexical support remain mandatory. Broader
inferences such as “network engineering expert” remain unsupported. This proves
a catalog defect, not the exact contents of the unavailable live response.

## Retry contract

Previously only provider transport errors were retried. Shared LLM analyzers now
allow one semantic repair after a domain-grounding rejection. The second call
uses identical bounded source context and schema, with a developer-authored
failure category added to the original instructions. Invalid model output,
raw exceptions and external information are not included in repair instructions.
Source content remains untrusted. Valid first responses require only one call.

Schema, provider envelope, configuration and transport failures do not trigger
semantic repair. Provider transport retry behavior is unchanged. At most two
structured-generation calls occur; with two transport retries configured, the
upper bound is six HTTP attempts. Existing per-request timeouts still apply;
there is no new overall deadline, so repair can increase latency and cost.

Both outputs pass the same strict validators. README evidence remains
`declared_only` / `weak`. No evidence or criteria are persisted before complete
validation, and a second grounding rejection returns `INVALID_MODEL_OUTPUT`.
There is no fallback success. Logs contain only analysis type, attempt number
and a fixed failure category. Shared analyzers cover Gemini and OpenAI; provider
adapters, rule-based analysis, matching formulas and database schema are unchanged.

## Verification

- Backend full suite: **245 passed** (includes 20 new repair tests).
- PostgreSQL repair suite: **20 passed**, including success/failure persistence.
- Project and need: invalid then valid, both invalid, first valid, and newly
  unsupported repair output are covered. Source/path/label checks and README
  evidence floors remain covered. Transport retries are tested separately and
  in combination with semantic repair; matching regressions passed unchanged.
- `python -m compileall -q app tests migrations scripts`: passed.
- `python -m pip check`: no broken requirements.
- `python -m alembic check`: no new upgrade operations (local PostgreSQL).
- Frontend lint, **13 tests**, and production build: passed.
- Existing Starlette TestClient/httpx deprecation warning remains.
- Live Gemini: **BLOCKED_BY_MISSING_KEY**; effective settings have no Gemini key.
  The two reported live scenarios still require user verification with a key.

These results support review, not a guarantee that future model responses will
always satisfy grounding. Authentication and rate limiting remain production
blockers documented in the security review.
