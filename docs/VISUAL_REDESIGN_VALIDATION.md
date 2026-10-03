# ZeminAI — Visual redesign validation

Date: 2026-10-03. Branch: `feat/ui-polish-apple`.
Comparison base: `ce5d944` (second polish pass).

## Scope and preserved behavior

This is a replacement of the visual composition, not a spacing-only polish.
No backend, API client, API schema, session persistence, matching formula,
discovery ordering, evidence provenance, Gemini retry, snapshots or database
implementation changed. No dependencies added. No push or PR.

## Structural changes

- Home: replaced the left-copy/right-dashboard composition with a centered,
  large typographic statement; horizontal four-part evidence story; one
  conceptual evidence comparison; two audience entry paths.
- Navigation: replaced five equal routes and the prominent reset action with
  Profil / İhtiyaç / Keşif and one contextual CTA. Demo reset remains available
  in a separate disclosure. Mobile has an explicit menu with Escape/focus return.
- Profile: candidate name is the primary heading. Three factual highlights
  (projects, observed technical evidence, total experience records) replace
  the initial eight-card summary. Timeline is the initial section. Full summary,
  talent map and evidence passport remain available. No overall talent score.
- Experience: six large icon/title/description choices precede a dedicated
  creation form. Form does not exist until a category is chosen. Native details
  preserve optional fields. Editing retains category and metadata. Escape/back
  return to the category surface; successful saving returns focus there.
- Candidate/project: centered writing surface and actual saved-state steps.
  Analysis and README/observed distinction remain unchanged.
- Need: centered heading, large textarea and optional role/output disclosure;
  required/preferred results remain separate. This is not a new criterion API.
- Match: large neutral score beside its scope disclaimer; coverage below;
  matched/unmatched criteria use rule-separated lists instead of card columns.
- Discovery: one candidate row, coverage, at most three supported criterion
  signals, missing criterion count, full details in disclosure. Server order
  and pagination are untouched; the preview helper never mutates input.
- Feedback: reusable ProcessingState for actual project/need/match operations;
  inline button spinner; existing initial skeletons; compact white success
  notice with title/detail and dismiss control. No simulated progress or timers.

## Design system

Single token set in globals.css; previous green tokens, hero-diagram/process-grid,
sidebar workspace and all-purpose boxed card treatment removed.

Background #F5F5F7; surface #FFFFFF; text #1D1D1F; secondary #6E6E73;
interactive accent #0071E3; semantic success/warning/error reserved for status.
Favicon is neutral. No gradients, content blur or glass surfaces.

System font: -apple-system, BlinkMacSystemFont, SF Pro Display, SF Pro Text,
Segoe UI, sans-serif. No downloaded fonts. Hero clamp(3rem,6vw,5.5rem),
page titles 40–52px, sections 28–36px, body 15–18px, small text 13–14px.
1240px global maximum, 704px form maximum; spacing tokens from 4 to 128px;
12/16/28px radius roles. Main controls 48–52px, smaller controls minimum 44px.

Contrast calculations: white on primary blue 4.70:1; secondary text on the page
background 4.66:1. Input borders darkened after review. Visible focus rings,
text labels for statuses, reduced-motion overrides and native form semantics
are retained. This is targeted accessibility QA, not a formal WCAG certification.

## Actual browser QA

Browser skill / real in-app Chromium browser; frontend localhost:3100,
isolated QA backend 127.0.0.1:8101 with rule_based provider and QA SQLite.
No live Gemini request required or claimed.

| Route | 1440x900 | 1280x800 | 390x844 |
| --- | --- | --- | --- |
| / | PASS | PASS | PASS |
| /aday | PASS | PASS | PASS |
| /profil | PASS | PASS | PASS |
| /ihtiyac | PASS | PASS | PASS |
| /eslesme | PASS | PASS | PASS |
| /kesif | PASS | PASS | PASS |

All 18 route/viewport combinations opened and screenshots saved outside the repo.
DOM document widths 1425 / 1265 / 375px respectively (15px native vertical
scrollbar); none exceeded viewport width. Additional scrolled checks covered
home evidence story, mobile experience chooser/form, mobile match and discovery.

Performed real UI actions:
- Hackathon category selection, optional metadata, create and edit/save a QA record.
- Verified existing title/metadata in edit form and save feedback.
- Escape from creation form; focus returned to category heading.
- Mobile menu opening, link keyboard Escape and menu-button Escape; focus returned.
- Created a QA project, executed real rule-based repository analysis, observed
  ProcessingState while the request was pending, then successful evidence output.
- Example need submitted; Python/FastAPI required and Docker preferred displayed.
- Match computation and discovery-to-match action succeeded.
- Anonymous and named discovery retained the same criterion coverage logic.

Review-driven corrections: fixed hash navigation after asynchronous profile
loading; prevented ordinary /aday visits from jumping to experience creation;
narrowed the selected-category form; reduced top spacing; replaced an education-only
highlight with all experience category counts; removed duplicated long loading
copy from the floating status. Rechecked affected views and keyboard actions.
Compared the prior home screenshot with the new centered composition.

## Automated gate

- `npm run lint`: PASS.
- `npm test`: 23/23 PASS (19 existing + 4 new).
- `npm run build`: PASS; all six application routes generated.
- `git diff --check`: PASS.
- Backend unchanged; backend suite not rerun for this visual-only task.

New tests cover factual profile totals, bounded non-mutating discovery summaries,
six category choices and selection forwarding, and truthful processing/loading output.

## VISUAL REDESIGN SELF-CHECK

- PASS — obvious composition/palette/navigation difference from the prior design.
- PASS — restrained, content-first simplicity.
- PASS — one coherent neutral palette and blue interactive accent.
- PASS — clear hero and contextual primary actions.
- PASS — prominent Hackathon choice after Deneyim ekle.
- PASS — consistently sized, limited-width forms.
- PASS — visible actual request state without invented progress.
- PASS — mobile navigation, category grid, forms and result rows.
- PASS — reduced dashboard/card clutter; lists and dividers establish hierarchy.
- PASS — no unnecessary glass or gradients.

These are implementation self-review results. Final visual acceptance belongs to
the user after viewing the browser preview. Status: READY_FOR_VISUAL_REVIEW.
