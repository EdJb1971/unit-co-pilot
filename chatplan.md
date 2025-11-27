# Chat-driven Session Editing — Plan (ChatPlan)

Purpose
- Provide nurses a low-friction conversational interface to refine, modify, or expand session plans by chatting with the LLM.
- Preserve safety, auditability, and human-in-the-loop control: the LLM proposes edits; nurse reviews and accepts them before changes are applied.

Goals
- Reduce friction for busy staff — allow natural language edits.
- Keep a full transcript and change history for audits and reversion.
- Avoid accidental overwrites and ensure safety gating when changes affect risk mitigations.
- Integrate with existing localStorage-based persistence, conflict detection (`savePlanSmart`), and expanded-session caching.

High-level flow
1. Nurse opens `Chat` modal from `SessionCard` for a slot.
2. Nurse chats freely; messages are appended to a local transcript store (not yet applied).
3. When nurse clicks `Propose changes`, the client calls `proposeSessionEdits(plan, transcript, context)` in `services/geminiService.ts`.
4. The LLM returns a validated JSON payload describing proposed edits (either full new `SessionPlan`/`ExpandedSession` or a minimal `changes` patch).
5. Client computes a diff / preview of proposed changes and shows a `ChangeReviewModal` with per-change checkboxes.
6. Nurse accepts all or selected changes and clicks `Apply changes`.
7. App uses `savePlanSmart` and `saveExpandedSession` to persist accepted edits, writes a `ChangeRecord`, and stores a new `PlanVersion` (for revert). A transcript entry and change record are appended to audit logs.

Data model additions
- ChatTranscript
  - key: `unit_copilot_chat_{date}_{slotId}`
  - shape: { id, date, slotId, messages: [{ id, role: 'nurse'|'assistant', text, ts }], lastModified }

- ChangeRecord
  - key: `unit_copilot_changes_{date}` (store keyed by date with an object map)
  - shape: { id, date, slotId, author: 'nurse', timestamp, diff: {path-> {before, after}}, accepted, reason?, metadata }

- PlanVersion
  - key: `unit_copilot_versions_{date}`
  - shape: { id, date, timestamp, author?, description?, plan: DailyPlan }

Persistence & keys
- Reuse `saveExpandedSession` / `loadExpandedSession` for expanded guidance cache.
- Implement `saveChatTranscript(date, slotId, message)` and `loadChatTranscript(date, slotId)` wrappers in `storageService.ts`.
- Implement `saveChangeRecord(date, change)` and `savePlanVersion(date, version)` in `storageService.ts`.

Services / API changes
- Add `proposeSessionEdits(plan: SessionPlan, transcript: ChatTranscript, context: {cohort, risks, recentActivities})` in `services/geminiService.ts`.
  - Input: current plan JSON + transcript + activeRisks + recent activities.
  - Output schema (strict):
    {
      changes: {
        session?: Partial<SessionPlan>,
        expanded?: Partial<ExpandedSession>,
        patches?: Array<{ op: 'replace'|'add'|'remove', path: string, value: any }>
      },
      explanation: string,
      safetyFlags?: string[]
    }
  - Requirements:
    - If `changes` is empty, assistant should explicitly return `changes: {}`.
    - Never apply changes on its own — client must confirm.

Prompt template (concise)
- System instruction: "You are a conservative clinical assistant that proposes safe, trauma-informed edits to a session plan. Do not remove safety mitigations. Provide a minimal JSON response matching the schema exactly. If no edits are needed return an empty `changes` object."
- User contents: include `currentPlan`, `transcript` (last N turns + short summary), `activeRisks`, and `recentActivities`.

Validation
- Validate LLM response against the schema in client (TypeScript) before showing diffs.
- Reject responses that propose removing critical safety fields or that contain malformed types.

Client UI components
- `ChatModal` (new)
  - Left column: chat transcript (nurse messages + AI replies). Input area for nurse.
  - Buttons: `Propose changes` (LLM call), `Save transcript` (persist), `Close` (keeps transcript local).
  - Message intent hints: optional quick prompts ("shorten steps", "add safety checklist", "make simpler language").

- `ChangeReviewModal` (new)
  - Shows side-by-side before/after for changed fields.
  - Per-change checkboxes for selective acceptance.
  - `Apply selected changes` button (runs apply flow) and `Discard`.
  - Shows safety warnings inline and forces an explicit safety checkbox when risk-related changes exist.

- `VersionHistory` (small UI)
  - A way to see previous `PlanVersion` entries for a date and revert.

Apply flow (client)
1. Nurse selects changes and confirms.
2. Client builds new plan object merging accepted diffs.
3. Call `savePlanSmart` with the new plan. If conflict, show conflict modal (existing vs local) and allow overwrite or keep remote.
4. If saved, create `PlanVersion` (store previous plan), write `ChangeRecord` with accepted=true, and persist any edited expanded sessions via `saveExpandedSession`.
5. Append chat transcript to storage with a note linking to `ChangeRecord`.

Safety gating
- If `changes` touch `riskMitigations` or safety-critical fields, require nurse to check a visible "I confirm I've reviewed safety changes" checkbox before `Apply` is enabled.
- Optionally block printing until review accepted.

Audit & Revert
- Keep `PlanVersion` list per date; include `revert` action that replaces current plan with selected version (use `savePlanSmart` and write a `ChangeRecord` capturing the revert).
- Export function (extend `exportAllData`) to include transcripts, changeRecords and versions.

Privacy & PHI
- Warn the nurse before sending any free text to LLMs; show a short banner that sensitive patient data should not be included in chat.
- Add a settings toggle to disable sending transcripts to external AI (local-only mode) that disables `Propose changes`.

Edge cases & mitigations
- Long transcripts: send last N turns + an LLM-generated summary to `proposeSessionEdits` to conserve tokens.
- LLM hallucinations: present diffs and require human acceptance; perform schema/safety validation.
- Offline: allow saving transcripts locally and queueing the `proposeSessionEdits` call until online.
- Conflicts: `savePlanSmart` already prompts; show a richer modal explaining differences for better decisions.

Implementation tasks (epic -> tasks)
1. Storage helpers (low-level)
   - `saveChatTranscript`, `loadChatTranscript`, `listChatKeys`.
   - `saveChangeRecord`, `loadChangeRecords`.
   - `savePlanVersion`, `listPlanVersions`.

2. LLM service
   - `proposeSessionEdits(plan, transcript, context)` in `services/geminiService.ts`.
   - Add prompt templates and response schema.

3. UI components
   - `ChatModal` with transcript UI and message input.
   - `ChangeReviewModal` showing diffs and per-change acceptance.
   - `VersionHistory` and lightweight conflict modal.

4. Integration
   - Hook ChatModal in `SessionCard` (button next to Expand/Handout).
   - Wire `Propose changes` -> `proposeSessionEdits` -> `ChangeReviewModal` -> apply -> `savePlanSmart` + `saveExpandedSession` + `savePlanVersion`.

5. Testing
   - Unit tests for `proposeSessionEdits` schema parsing and local validation.
   - E2E manual flows: create transcript, propose, review, accept, revert.

6. Rollout & telemetry
   - Feature flag `chatEditingEnabled` (settings) to roll out gradually.
   - Basic metrics: counts of proposals, accepted changes, reverts, conflict prompts.

Estimated effort (MVP)
- Storage + service scaffolding: 3–5 hours
- `proposeSessionEdits` prompt + schema + basic validation: 3–5 hours
- `ChatModal` + `ChangeReviewModal` UX (basic): 6–10 hours
- Integration, testing, and polish: 4–8 hours
- Total: ~1.5–3 working days for a safe, usable MVP.

Next steps (I can start implementing)
1. Add storage helpers and types in `services/storageService.ts` and `types.ts`.
2. Add `proposeSessionEdits` in `services/geminiService.ts` with a strict response schema and sample prompt.
3. Scaffold `ChatModal` + `ChangeReviewModal` components and wire `SessionCard` to open the chat.
4. Implement basic apply flow that uses `savePlanSmart` + `saveExpandedSession` + `savePlanVersion` and records a `ChangeRecord`.
Which step should I start on first? I recommend starting with (1) storage helpers and (2) `proposeSessionEdits` service so the UI can be wired to a stable backend. If you agree I'll begin by adding storage helper functions and the new service method, then scaffold the `ChatModal` component next.

---

Progress update (implemented)
- Added storage helpers: `saveChatTranscript`, `loadChatTranscript`, `listChatKeys`, `saveChangeRecord`, `loadChangeRecords`, `savePlanVersion`, `listPlanVersions` in `services/storageService.ts`.
- Added TypeScript types: `ChatMessage`, `ChatTranscript`, `ChangeRecord`, `PlanVersion` in `types.ts`.
- Implemented `proposeSessionEdits` in `services/geminiService.ts` (conservative prompt + strict json response handling).
- Scaffolded UI components: `components/ChatModal.tsx` and `components/ChangeReviewModal.tsx`.
- Wired Chat button into `components/SessionCard.tsx` and implemented the propose -> review -> apply flow (saves transcripts, shows review modal, applies accepted session/expanded/patch changes, writes `ChangeRecord`, and saves `PlanVersion`).

Notes:
- The apply flow currently supports `changes.session`, `changes.expanded`, and `changes.patches` (basic `replace` ops) returned by the LLM. It creates a `ChangeRecord` containing before/after diffs and persists a `PlanVersion` for revert/audit.
- UI components use small inline styles for the prototype; these can be moved to CSS files during polish.
- Next: add unit tests and polish conflict UI (richer diff modal). I can implement these next if you want.