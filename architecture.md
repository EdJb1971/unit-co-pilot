
# Architecture — Unit Co-Pilot

This document captures the current implementation and design decisions for the app so maintainers can reason about data flow, safety, and extension points.

## Tech stack
- Vite + React + TypeScript
- Browser-only persistence via `localStorage` (no server required by default)

## Repo layout (important files)
- `App.tsx` — application shell, startup hooks, migrations and scheduled cleanup runner
- `index.tsx`, `index.html` — entry points
- `components/` — UI components
  - `SessionCard.tsx` — per-slot UI and primary orchestration of generate/chat/review flows
  - `ChatModal.tsx` — linear transcript UI, autosave, quick prompts, sends to `proposeSessionEdits`
  - `ChangeReviewModal.tsx` — human review UI for proposed changes; accepts/declines patches
  - `VentModal.tsx` — ephemeral vent interface
- `services/` — core application logic
  - `geminiService.ts` — LLM integration and helpers
  - `storageService.ts` — local persistence, scheduled deletion, versioning, and change records

## Services & key functions
- `services/geminiService.ts`
  - `generateDailyPlan(cohort, risks)` — creates an initial day plan
  - `generateExpandedSession(plan, slotId, context)` — returns an expanded session object including `printable` intended for handouts
  - `proposeSessionEdits(plan, transcript, cohort, risks, options)` — analyzes transcript and returns a structured proposal `{ session, patches, explanation, safetyFlags }`
  - `chatVent(messages, options)` — runs local safety checks and returns an LLM-style response while defaulting to ephemeral behavior
  - Helpers: `detectSafetyConcerns`, `anonymizeMessages`, `detectFacilitatorName`

- `services/storageService.ts`
  - Plan persistence: `savePlan`, `loadPlan`, `savePlanSmart`, `savePlanVersion`
  - Expanded session cache: `saveExpandedSession`, `loadExpandedSession`
  - Chat transcripts: `saveChatTranscript`, `loadChatTranscript`, `deleteChatTranscript`, `scheduleChatTranscriptDeletion`, `performScheduledChatCleanup`
  - Audit artifacts: `saveChangeRecord`

## Data flow (concise)
1. Generate day plan: `generateDailyPlan` → `savePlanSmart(date, plan)`
2. Expand slot or create handout: `generateExpandedSession` → `saveExpandedSession(date, slotId, expanded)`
3. Chat editing flow:
   - Facilitator opens `ChatModal` and types messages (autosaved via `saveChatTranscript`)
   - On "Propose changes", `proposeSessionEdits(plan, transcript, ...)` is called
   - `ChangeReviewModal` shows `proposed` session and `patches` — user selects which changes to accept
   - On accept: `SessionCard` applies minimal changes to the `DailyPlan` object, writes a `PlanVersion` and `ChangeRecord`, calls `savePlanSmart`, and either deletes or schedules deletion of the transcript

4. Vent Mode:
   - `VentModal` collects messages, calls `chatVent`
   - `chatVent` runs local safety heuristics and will not forward first-person self-harm/violence; users can copy/export the ephemeral transcript

## Safety and privacy design decisions
- Local-first: everything persisted by default is in `localStorage`. No telemetry or server sync unless you add it explicitly.
- Human-in-the-loop: proposed edits from the model are presented to humans — no automatic application.
- Vent mode: ephemeral-by-default with safety block and canned guidance for dangerous messages.

## Packaging and Dev notes
- `scripts/generate-icon.cjs` produces `icons/icon.ico` from the SVG icons using `sharp` + `to-ico`. If you can't install `sharp` on Windows, run `npm run generate:icons` on a machine with the toolchain, or remove `sharp` and use a fallback PNG-only approach.
- Electron scaffolding exists in `electron/` with `electron/main.js` and `electron/preload.js`; use `npm run electron:build` to build a Windows installer — local build steps required.

## Operational & maintenance notes
- On startup `App` runs migrations and `performScheduledChatCleanup()` to remove transcripts that were scheduled for deletion.
- `savePlanSmart` attempts to avoid overwriting changes made in other tabs via a simple `lastModified` check and prompts the user on conflict.

## Known issues & next improvements
- LLM sometimes returns malformed JSON — `geminiService` contains hardening code (safe parsing, retries, logging) but more few-shot prompts and stricter schema enforcement are still recommended for `generateExpandedSession` and `proposeSessionEdits`.
- No automated tests yet — add unit tests for `proposeSessionEdits` parsing, `detectSafetyConcerns`, and `storageService` behavior.
- Consider optional encrypted backup/sync for multi-device usage (requires a server or encrypted cloud storage).

## Where to start when contributing
1. Read `services/geminiService.ts` to understand prompts and response parsing.
2. Run `npm install` and `npm start` to boot the app locally.
3. Inspect `components/SessionCard.tsx` and `components/ChangeReviewModal.tsx` to see the apply flow and where to wire additional acceptance rules.

---


