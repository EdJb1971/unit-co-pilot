**Overview**
- **Purpose**: Document the high-level architecture for this small Vite + React + TypeScript app so contributors can quickly understand responsibilities and data flow.
- **Tech stack**: `Vite`, `React`, `TypeScript`.

**Repo Structure**
- **Root files**: `App.tsx`, `index.tsx`, `index.html`, `tsconfig.json`, `package.json`, `vite.config.ts`.
- **Types / constants / metadata**: `types.ts`, `constants.ts`, `metadata.json`.
- **Components**: located in the `components/` folder.
- **Services**: located in the `services/` folder.

**Key Components**
- **`RegenerateDialog.tsx`**: UI dialog to confirm or trigger regeneration actions.
- **`RiskToggle.tsx`**: Control that toggles a risk-related mode/setting in the UI.
- **`SessionCard.tsx`**: Presents per-session information and actions to the user.

Each component is a focused presentational/interactive piece. Prefer keeping business logic in services or hooks rather than inside UI components.

**Services**
- **`services/geminiService.ts`**: Encapsulates external API calls or model interactions. Keep API-specific request/response shapes here and expose small, well-typed functions for the UI.
- **`services/storageService.ts`**: Handles persistence (likely `localStorage` or similar). Abstracts save/load operations so components don't require persistence logic.

Keep services side-effecting, well-typed, and testable. Return plain data structures (not DOM elements or framework classes).

**Data Flow & State**
- **User actions** in components -> call service functions in `services/` -> services perform I/O (API, persistence) -> components update local state or props.
- There is no global store by default; components manage local state and use `storageService` for persistence. If state sharing increases, consider adding a lightweight state solution (React Context or Zustand).

**Build & Run**
- **Install**: `npm install`
- **Dev**: `npm run dev` (Vite dev server)
- **Build**: `npm run build`
- **Preview**: `npm run preview`

If `package.json` uses different scripts, prefer the scripts defined there.

**Testing**
- No tests included in the repository by default. Recommended first steps:
  - Add unit tests for `services/` (API shapes, storage behavior).
  - Add component-level tests for key components (`SessionCard`, `RiskToggle`).

**Observability & Quality**
- Add ESLint + Prettier configs if not present.
- Add basic type-safe runtime checks for external API responses in `geminiService.ts`.

**Security & Privacy**
- Do not store sensitive API keys in source; prefer environment variables.
- Sanitize and validate external inputs before rendering.

**Notes & Next Steps**
- Add a simple diagram (sequence or component) to show calls between UI -> `geminiService` -> remote API and persistence.
- Add a small CONTRIBUTING or developer guide with `npm` scripts and a recommended local dev workflow.
- Consider adding automated CI checks (lint, typecheck, tests) on PRs.

**Contact / Ownership**
- If you want, tell me who owns which areas (services, components) and I can expand sections with responsibilities and coding guidelines.

---
Generated: concise architectural overview for the current codebase.
