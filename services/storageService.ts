import { DailyPlan, ChatTranscript, ChangeRecord, PlanVersion } from '../types';

import { ExpandedSession } from '../types';

// Normalize older ExpandedSession shapes into the new structured shape.
const normalizeExpandedSession = (raw: any): ExpandedSession => {
  if (!raw || typeof raw !== 'object') return raw;
  const out: any = { ...raw };

  // Materials: allow ['flour', 'salt'] or [{name, quantity, notes}]
  if (Array.isArray(out.materials)) {
    out.materials = out.materials.map((m: any) => {
      if (!m) return { name: String(m) };
      if (typeof m === 'string') return { name: m };
      if (typeof m === 'object' && m.name) return { name: String(m.name), quantity: m.quantity ? String(m.quantity) : undefined, notes: m.notes ? String(m.notes) : undefined };
      // fallback
      return { name: String(m) };
    });
  } else {
    out.materials = [];
  }

  // Facilitator script: ensure array of objects with stepNumber/time/step
  if (Array.isArray(out.facilitatorScript)) {
    out.facilitatorScript = out.facilitatorScript.map((s: any, idx: number) => {
      if (!s) return { stepNumber: idx + 1, step: '' };
      if (typeof s === 'string') return { stepNumber: idx + 1, step: s };
      return {
        stepNumber: s.stepNumber ?? (idx + 1),
        time: s.time ?? s.duration ?? undefined,
        step: s.step ?? s.instruction ?? '',
        cues: s.cues ?? undefined,
        adlibs: s.adlibs ?? undefined,
        safetyChecks: s.safetyChecks ?? s.safety ?? undefined,
        note: s.note ?? undefined
      };
    });
  } else {
    out.facilitatorScript = [];
  }

  // Ensure arrays for optional fields
  out.tips = Array.isArray(out.tips) ? out.tips : [];
  out.riskMitigations = Array.isArray(out.riskMitigations) ? out.riskMitigations : [];
  out.branches = Array.isArray(out.branches) ? out.branches : [];
  out.therapeuticPrompts = Array.isArray(out.therapeuticPrompts) ? out.therapeuticPrompts : [];
  out.accommodations = Array.isArray(out.accommodations) ? out.accommodations : [];
  out.sensoryConsiderations = Array.isArray(out.sensoryConsiderations) ? out.sensoryConsiderations : [];
  out.allergyChecks = typeof out.allergyChecks === 'string' ? out.allergyChecks : (out.allergyChecks ? String(out.allergyChecks) : 'Confirm allergies before starting.');

  // Printable: ensure content and title exist
  if (!out.printable || typeof out.printable !== 'object') {
    out.printable = { title: `${out.specialist || 'Activity'} - Handout`, type: 'guide', content: out.printable?.content || '' };
  } else {
    out.printable.title = out.printable.title || `${out.specialist || 'Activity'} - Handout`;
    out.printable.type = out.printable.type || 'guide';
    out.printable.content = out.printable.content || '';
  }

  return out as ExpandedSession;
};

const STORAGE_PREFIX = 'unit_copilot_plan_';

export const savePlan = (date: string, plan: DailyPlan): void => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${date}`, JSON.stringify(plan));
  } catch (e) {
    console.error("Failed to save plan to storage", e);
  }
};

export const loadPlan = (date: string): DailyPlan | null => {
  try {
    const data = localStorage.getItem(`${STORAGE_PREFIX}${date}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Ensure lastModified exists for compatibility
    if (!parsed.lastModified) parsed.lastModified = 0;
    return parsed;
  } catch (e) {
    console.error("Failed to load plan from storage", e);
    return null;
  }
};

// Smart save with simple conflict detection. Returns { ok:true } or { ok:false, conflict:true, existing }
export const savePlanSmart = (date: string, plan: DailyPlan, options?: { force?: boolean }) => {
  try {
    const existingRaw = localStorage.getItem(`${STORAGE_PREFIX}${date}`);
    if (existingRaw && !options?.force) {
      try {
        const existing = JSON.parse(existingRaw) as DailyPlan;
        const existingTs = existing.lastModified || 0;
        const incomingTs = plan.lastModified || 0;
        if (existingTs > incomingTs) {
          return { ok: false, conflict: true, existing };
        }
      } catch (e) {
        // ignore parse errors and continue to write
      }
    }

    const toSave = { ...plan, lastModified: Date.now() };
    localStorage.setItem(`${STORAGE_PREFIX}${date}`, JSON.stringify(toSave));
    return { ok: true };
  } catch (e) {
    console.error('Failed to save plan (smart)', e);
    return { ok: false, error: String(e) };
  }
};

export const hasPlanForDate = (date: string): boolean => {
    return !!localStorage.getItem(`${STORAGE_PREFIX}${date}`);
}

// Expanded session storage (per-slot)
const EXPANDED_PREFIX = 'unit_copilot_expanded_';

export const saveExpandedSession = (date: string, slotId: string, expanded: ExpandedSession): void => {
  try {
    // Normalize before saving so stored format is consistent
    const normalized = normalizeExpandedSession(expanded as any);
    try {
      console.debug('Saving expanded session to localStorage:', `${EXPANDED_PREFIX}${date}_${slotId}`, normalized);
    } catch (_) {}
    localStorage.setItem(`${EXPANDED_PREFIX}${date}_${slotId}`, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save expanded session', e);
  }
};

export const loadExpandedSession = (date: string, slotId: string): ExpandedSession | null => {
  try {
    const key = `${EXPANDED_PREFIX}${date}_${slotId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    try { console.debug('Loaded expanded session from localStorage:', key, parsed); } catch (_) {}
    return normalizeExpandedSession(parsed);
  } catch (e) {
    console.error('Failed to load expanded session', e);
    return null;
  }
};

export const clearExpandedSession = (date: string, slotId: string): void => {
  try {
    localStorage.removeItem(`${EXPANDED_PREFIX}${date}_${slotId}`);
  } catch (e) {
    console.error('Failed to clear expanded session', e);
  }
};

// Simple settings helper
const SETTINGS_KEY = 'unit_copilot_settings';
export const saveSetting = (key: string, value: any) => {
  try {
    const settingsRaw = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    settings[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save setting', e);
  }
};

export const loadSetting = (key: string, fallback: any = null) => {
  try {
    const settingsRaw = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    return settings[key] ?? fallback;
  } catch (e) {
    console.error('Failed to load setting', e);
    return fallback;
  }
};

// Export all stored data (plans, expanded sessions, settings)
export const exportAllData = () => {
  try {
    const exported: any = { plans: {}, expanded: {}, settings: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(STORAGE_PREFIX)) {
        const date = key.replace(STORAGE_PREFIX, '');
        exported.plans[date] = JSON.parse(localStorage.getItem(key) || 'null');
      } else if (key.startsWith(EXPANDED_PREFIX)) {
        const remainder = key.replace(EXPANDED_PREFIX, '');
        exported.expanded[remainder] = JSON.parse(localStorage.getItem(key) || 'null');
      } else if (key === SETTINGS_KEY) {
        exported.settings = JSON.parse(localStorage.getItem(key) || '{}');
      }
    }
    return { ok: true, data: exported };
  } catch (e) {
    console.error('Failed to export data', e);
    return { ok: false, error: String(e) };
  }
};

// Import data (overwrite existing keys for the imported data)
export const importData = (payload: any) => {
  try {
    if (payload.plans) {
      for (const date of Object.keys(payload.plans)) {
        localStorage.setItem(`${STORAGE_PREFIX}${date}`, JSON.stringify(payload.plans[date]));
      }
    }
    if (payload.expanded) {
      for (const k of Object.keys(payload.expanded)) {
        // Normalize imported expanded session entries
        try {
          const normalized = normalizeExpandedSession(payload.expanded[k]);
          localStorage.setItem(`${EXPANDED_PREFIX}${k}`, JSON.stringify(normalized));
        } catch (_) {
          localStorage.setItem(`${EXPANDED_PREFIX}${k}`, JSON.stringify(payload.expanded[k]));
        }
      }
    }
    if (payload.settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload.settings));
    }
    return { ok: true };
  } catch (e) {
    console.error('Failed to import data', e);
    return { ok: false, error: String(e) };
  }
};

// Migrate any existing expanded session entries in localStorage to the normalized format.
export const migrateExpandedSessions = () => {
  try {
    let migrated = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(EXPANDED_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const normalized = normalizeExpandedSession(parsed);
          localStorage.setItem(key, JSON.stringify(normalized));
          migrated++;
        } catch (e) {
          // ignore malformed entries
        }
      }
    }
    return { ok: true, migrated };
  } catch (e) {
    console.error('Migration failed', e);
    return { ok: false, error: String(e) };
  }
};

// Return recent activity titles for the given date going back N days (including date).
export const getRecentActivityTitles = (dateStr: string, days = 3): string[] => {
  try {
    const base = new Date(dateStr);
    const titles: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = d.toLocaleDateString();
      const plan = loadPlan(key);
      if (plan && plan.slots && plan.slots.length > 0) {
        for (const s of plan.slots) {
          if (s && s.plan && s.plan.title) titles.push(`${d.toLocaleDateString()} — ${s.period}: ${s.plan.title}`);
        }
      }
    }
    return titles;
  } catch (e) {
    return [];
  }
};

// Chat transcript storage helpers
const CHAT_PREFIX = 'unit_copilot_chat_';

export const saveChatTranscript = (date: string, slotId: string, transcript: ChatTranscript): { ok: boolean } => {
  try {
    const key = `${CHAT_PREFIX}${date}_${slotId}`;
    const toSave = { ...transcript, lastModified: Date.now() };
    localStorage.setItem(key, JSON.stringify(toSave));
    return { ok: true };
  } catch (e) {
    console.error('Failed to save chat transcript', e);
    return { ok: false };
  }
};

export const loadChatTranscript = (date: string, slotId: string): ChatTranscript | null => {
  try {
    const key = `${CHAT_PREFIX}${date}_${slotId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as ChatTranscript : null;
  } catch (e) {
    console.error('Failed to load chat transcript', e);
    return null;
  }
};

export const listChatKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(CHAT_PREFIX)) keys.push(key.replace(CHAT_PREFIX, ''));
  }
  return keys;
};

export const deleteChatTranscript = (date: string, slotId: string): { ok: boolean } => {
  try {
    const key = `${CHAT_PREFIX}${date}_${slotId}`;
    localStorage.removeItem(key);
    return { ok: true };
  } catch (e) {
    console.error('Failed to delete chat transcript', e);
    return { ok: false };
  }
};

// Scheduled cleanup helpers
const CHAT_CLEANUP_PREFIX = 'unit_copilot_chat_cleanup_';

export const scheduleChatTranscriptDeletion = (date: string, slotId: string, ttlMs: number): { ok: boolean } => {
  try {
    const key = `${CHAT_CLEANUP_PREFIX}${date}_${slotId}`;
    const expiry = Date.now() + ttlMs;
    localStorage.setItem(key, JSON.stringify({ date, slotId, expiry }));
    return { ok: true };
  } catch (e) {
    console.error('Failed to schedule chat transcript deletion', e);
    return { ok: false };
  }
};

export const performScheduledChatCleanup = (): { ok: boolean; cleaned: number } => {
  try {
    let cleaned = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(CHAT_CLEANUP_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { date: string; slotId: string; expiry: number };
          if (parsed.expiry && parsed.expiry <= Date.now()) {
            // delete transcript and cleanup entry
            const tkey = `${CHAT_PREFIX}${parsed.date}_${parsed.slotId}`;
            localStorage.removeItem(tkey);
            localStorage.removeItem(key);
            cleaned++;
          }
        } catch (_) {
          // ignore malformed entries
        }
      }
    }
    return { ok: true, cleaned };
  } catch (e) {
    console.error('Scheduled chat cleanup failed', e);
    return { ok: false, cleaned: 0 };
  }
};

// Change record storage helpers
const CHANGE_PREFIX = 'unit_copilot_change_';
export const saveChangeRecord = (date: string, record: ChangeRecord): { ok: boolean } => {
  try {
    const key = `${CHANGE_PREFIX}${date}`;
    const existingRaw = localStorage.getItem(key);
    const map = existingRaw ? JSON.parse(existingRaw) : {};
    map[record.id] = record;
    localStorage.setItem(key, JSON.stringify(map));
    return { ok: true };
  } catch (e) {
    console.error('Failed to save change record', e);
    return { ok: false };
  }
};

export const loadChangeRecords = (date: string): Record<string, ChangeRecord> | null => {
  try {
    const key = `${CHANGE_PREFIX}${date}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as Record<string, ChangeRecord> : null;
  } catch (e) {
    console.error('Failed to load change records', e);
    return null;
  }
};

// Plan version helpers
const VERSION_PREFIX = 'unit_copilot_versions_';
export const savePlanVersion = (date: string, version: PlanVersion): { ok: boolean } => {
  try {
    const key = `${VERSION_PREFIX}${date}`;
    const existingRaw = localStorage.getItem(key);
    const arr = existingRaw ? JSON.parse(existingRaw) : [];
    arr.push(version);
    localStorage.setItem(key, JSON.stringify(arr));
    return { ok: true };
  } catch (e) {
    console.error('Failed to save plan version', e);
    return { ok: false };
  }
};

export const listPlanVersions = (date: string): PlanVersion[] => {
  try {
    const key = `${VERSION_PREFIX}${date}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as PlanVersion[] : [];
  } catch (e) {
    console.error('Failed to list plan versions', e);
    return [];
  }
};