# Motion / polish validation

Date: 2026-10-03. Branch: `feat/ui-polish-apple`.
Preserves the approved visual redesign. No backend, API, matching, evidence,
dependency or data-schema changes. No push.

## Changes

- Candidate sections share a 960px flow, quiet dividers and 01–04 headings:
  basic profile, projects, technical evidence, experiences. Anchor navigation
  explicitly says completion is optional; this is not a mandatory wizard.
- Experience chooser/form and profile panels share an interruptible controller:
  80ms exit followed by 180ms entrance/height interpolation (260ms total),
  opacity plus 8px translation, without spring motion. Latest interaction wins.
  Cancellation restores inert state and removes temporary height/overflow styles.
- Shared 180ms/260ms tokens and easing govern hover and content transitions.
  CSS durations compiled to seconds are converted correctly for WAAPI.
- Header and homepage textual CTAs use left-origin underline entrance and
  right-origin exit. Active navigation stays marked; keyboard focus is separate.
  Solid primary buttons have no underline.
- Profile avatar: 112px desktop, 72px mobile, aligned with identity text.
  Loading fact placeholders reserve space. Tabs expose tablist/tab/tabpanel,
  roving focus, Arrow/Home/End navigation and Enter/Space activation.
- Native details gain progressive height/opacity transitions without unmounting
  fields. Unsupported browsers retain native disclosure behavior. This follows
  the [official Chrome details guidance](https://developer.chrome.com/blog/styling-details).
- Notices, processing feedback and reset confirmation share a brief entrance;
  summary and dismiss controls have hover feedback. No decorative looping motion.

## Actual browser checks

Local browser: frontend localhost:3100 with the existing rule-based QA session.
1440x900, 1280x800 and 390x844 viewports were inspected.

- Candidate: category → Hackathon/Sertifika/Eğitim forms, back/other category,
  Escape and heading focus return; project section and existing 34-record
  analysis display; shared section alignment; native details opening/closing.
- Profile: all four sections, hover, activation, rapid competing selections,
  avatar/header and loaded fact strip. Mobile Home/Arrow/Enter tab navigation
  preserves manual activation and the correct panel relationship.
- Header: Profil/İhtiyaç/Keşif hover and persistent active marker. Measured
  underline origin switches left to right; link rectangles stay unchanged.
- Homepage: both bottom textual CTA hover/leave, hero-to-content composition,
  and solid primary button (pseudo-element content remains none).
- Measured mobile document width 375px within the 390px viewport. No observed
  horizontal overflow, persistent text blur, flicker or unexpected layout jumps
  in the exercised flows. Real pointer tab activation preserved scrollY;
  locator auto-scrolling was distinguished from application behavior.
- Motion state and temporary styles clear after transitions. Native disclosure
  closing was observed at an intermediate height, confirming real interpolation.

Reduced motion is verified by controller tests (immediate commit, no animation,
and preference change during exit) and CSS inspection, including the
`::details-content` pseudo-element. The available browser tool cannot emulate
the OS reduced-motion preference; no claim of browser-emulated preference QA.

## Quality gates

- `npm run lint`: PASS.
- `npm test`: PASS, 30 tests (23 existing + 7 motion regressions).
- `npm run build`: PASS, production compilation and TypeScript validation.
- `git diff --check`: PASS.
- Backend tests not rerun: backend unchanged in this frontend-only task.

## MOTION / POLISH SELF-CHECK

| Check | Result |
| --- | --- |
| Açılan içerikler artık sert görünmüyor | PASS |
| Navigation hover premium hissettiriyor | PASS |
| Hover layout shift oluşturmuyor | PASS |
| Aday sayfası tek bir akış gibi hissediliyor | PASS |
| Profil header dengeli | PASS |
| Profil sekmeleri doğal hissettiriyor | PASS |
| Motion tutarlı | PASS |
| Reduced motion çalışıyor | PASS — automated/CSS checks, limitation above |
| Mobile etkilenmedi | PASS |
| Gereksiz animasyon eklenmedi | PASS |

READY_FOR_VISUAL_REVIEW
