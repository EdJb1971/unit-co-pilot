import { GoogleGenAI, Type } from "@google/genai";
import { SINGLE_SLOT_SYSTEM_INSTRUCTION, RESOURCE_SYSTEM_INSTRUCTION, REGENERATE_SYSTEM_INSTRUCTION, EXPANDED_SESSION_SYSTEM_INSTRUCTION } from "../constants";
import { CohortState, RiskFactor, DailyPlan, PrintableResource, SessionPlan, TimeSlot } from "../types";
import { ExpandedSession } from "../types";
import { loadSetting, getRecentActivityTitles } from "./storageService";

// Create AI client per-call using the stored (obfuscated) API key in localStorage.
// Keys are stored obfuscated (base64) for light obfuscation; this is NOT secure encryption.
const getAI = (): GoogleGenAI => {
    let apiKey: string | null = null;
    try {
        const enc = loadSetting('GEMINI_API_KEY', null);
        if (typeof enc === 'string' && enc.length > 0) {
            try { apiKey = atob(enc); } catch (e) { apiKey = enc; }
        }
    } catch (e) {
        // ignore
    }
    if (!apiKey) throw new Error('No API key configured. Please set it in the app settings.');
    return new GoogleGenAI({ apiKey });
}

// Helper to sanitize potentially crazy lists from AI
const sanitizeList = (list: any, maxItems: number): string[] => {
    if (!Array.isArray(list)) return [];
    return list.slice(0, maxItems).map(item => String(item));
};

// Propose session edits based on a chat transcript. Returns a strict JSON with minimal changes and explanation.
export const proposeSessionEdits = async (
    plan: SessionPlan,
    transcript: any,
    cohort: CohortState,
    risks: RiskFactor[],
    options?: { maxSummaryTurns?: number; allowPersonalization?: boolean }
): Promise<{ changes: any; explanation?: string; safetyFlags?: string[] }> => {
    // Helper: try to infer the facilitator/nurse's preferred name from their own messages.
    // Only accept names explicitly introduced by the nurse (e.g., "I'm Alice", "My name is Alice", "This is Alice").
    // Do NOT infer or store any names that may refer to patients; only use names coming from messages where role === 'nurse'.
    const detectFacilitatorName = (transcriptObj: any): string | null => {
        try {
            const msgs = Array.isArray(transcriptObj?.messages) ? transcriptObj.messages : [];
            // scan recent nurse messages from latest to earliest
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (!m || typeof m.text !== 'string') continue;
                if (m.role && String(m.role).toLowerCase() !== 'nurse') continue;
                const t = m.text.trim();
                // common explicit self-introductions
                const re = /(?:\bmy name is|\bi am|\bi'm|\bthis is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i;
                const match = t.match(re);
                if (match && match[1]) {
                    // return first plausible capitalized name
                    return match[1].trim();
                }
                // signature-style: lines like "- Alice" or "— Alice"
                const sig = t.split('\n').map(s => s.trim()).find(s => /^[-—]\s*[A-Z][a-z]+/.test(s));
                if (sig) {
                    const nm = sig.replace(/^[-—]\s*/, '').split(' ')[0];
                    if (/^[A-Z][a-z]+$/.test(nm)) return nm;
                }
            }
        } catch (_) {
            // ignore failures and don't infer
        }
        return null;
    };

    const inferredName = detectFacilitatorName(transcript);
    let systemInstruction = `You are a conservative clinical assistant that proposes safe, trauma-informed edits to a session plan. Do not remove safety mitigations. Provide a minimal JSON response matching the schema exactly. If no edits are needed return an empty changes object.`;
    // Only include personalization hint when caller explicitly allows personalization
    if (options?.allowPersonalization && inferredName) {
        systemInstruction += ` When appropriate, address the facilitator briefly as \"${String(inferredName)}\" to offer encouragement or personalization. Do NOT use or repeat any patient or participant names; if there is any ambiguity, do not use any name.`;
    }

    // Create a compact transcript summary (last N turns)
    const allMessages = Array.isArray(transcript?.messages) ? transcript.messages : [];
    const last = options?.maxSummaryTurns ? allMessages.slice(-options.maxSummaryTurns) : allMessages.slice(-12);
    const summary = last.map((m: any) => `${m.role}: ${m.text}`).join('\n');

    const activeRisks = risks.filter(r => r.active).map(r => `${r.label}: ${r.description}`);

    const prompt = `CURRENT PLAN:\n${JSON.stringify(plan, null, 2)}\n\nCOHORT:\n${JSON.stringify(cohort, null, 2)}\n\nACTIVE RISKS:\n${activeRisks.join('\n') || 'None'}\n\nRECENT TRANSCRIPT (last turns):\n${summary}\n\nINSTRUCTIONS:\n- Propose only minimal edits necessary to satisfy the nurse's requests.\n- Return JSON with shape: { "changes": { /* minimal partials or patches */ }, "explanation": "...", "safetyFlags": ["..."] }\n- If no edits are necessary return {"changes":{}}.\n- Do not include free text outside the JSON response.`;

    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                systemInstruction,
                temperature: 0.3,
                responseMimeType: 'application/json',
                // Provide a concrete schema for changes to satisfy the API requirement
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        changes: {
                            type: Type.OBJECT,
                            properties: {
                                session: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        therapeuticGoal: { type: Type.STRING },
                                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                },
                                expanded: {
                                    type: Type.OBJECT,
                                    properties: {
                                        printable: {
                                            type: Type.OBJECT,
                                            properties: {
                                                title: { type: Type.STRING },
                                                content: { type: Type.STRING }
                                            }
                                        }
                                    }
                                },
                                patches: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            op: { type: Type.STRING },
                                            path: { type: Type.STRING },
                                            value: { type: Type.STRING }
                                        }
                                    }
                                }
                            }
                        },
                        explanation: { type: Type.STRING },
                        safetyFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });

        const text = response.text || '{}';
        // Debug raw response for easier troubleshooting
        try { console.debug('proposeSessionEdits raw response:', text); } catch (_) {}

        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsed: any = {};
        try {
            parsed = JSON.parse(jsonStr);
        } catch (pe) {
            console.warn('proposeSessionEdits JSON parse failed, attempting recovery', pe);
            // Try to recover by extracting first JSON object block
            try {
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    const sub = jsonStr.slice(firstBrace, lastBrace + 1);
                    parsed = JSON.parse(sub);
                    console.warn('Recovered JSON for proposeSessionEdits by substring extraction');
                } else {
                    // As a last resort, try to find a "changes" object and parse that substring
                    const changesIdx = jsonStr.indexOf('"changes"');
                    if (changesIdx !== -1) {
                        const chStart = jsonStr.indexOf('{', changesIdx);
                        const chEnd = jsonStr.indexOf('}', chStart);
                        if (chStart !== -1 && chEnd !== -1) {
                            const sub = jsonStr.slice(chStart, chEnd + 1);
                            parsed = JSON.parse(sub);
                        }
                    }
                }
            } catch (recErr) {
                console.warn('Recovery parse failed for proposeSessionEdits', recErr);
                parsed = {};
            }
        }

        // Normalize parsed shape: ensure we return an object with .changes
        let changes: any = {};
        try {
            if (parsed && typeof parsed === 'object') {
                // If the top-level looks like a 'changes' object (contains expected keys), treat parsed as changes
                const maybeKeys = ['session', 'expanded', 'patches'];
                const hasAny = maybeKeys.some(k => Object.prototype.hasOwnProperty.call(parsed, k));
                if (hasAny) {
                    changes = parsed;
                } else if (parsed.changes && typeof parsed.changes === 'object') {
                    changes = parsed.changes;
                } else if (typeof parsed.changes === 'string') {
                    try { changes = JSON.parse(parsed.changes); } catch (_) { changes = {}; }
                } else {
                    changes = parsed.changes || {};
                }
            }
        } catch (normErr) {
            console.warn('Failed to normalize proposeSessionEdits parsed object', normErr);
            changes = {};
        }

        try { console.debug('proposeSessionEdits parsed:', { parsed, changes }); } catch (_) {}

        return { changes: changes || {}, explanation: (parsed && parsed.explanation) ? parsed.explanation : '', safetyFlags: Array.isArray(parsed?.safetyFlags) ? parsed.safetyFlags : [] };
    } catch (e) {
        console.error('proposeSessionEdits error', e);
        return { changes: {}, explanation: 'LLM call failed', safetyFlags: [] };
    }
};

// Enhanced safety detector for vent/chat messages.
// Returns an array of detected concerns with context distinguishing first-person intent vs third-person reports.
const detectSafetyConcerns = (messages: Array<{ role?: string; text?: string }>) => {
    const texts = messages.map(m => String(m.text || '')).join('\n');
    const flags: Array<{ flag: string; context: 'first-person' | 'third-person' | 'unknown' }> = [];

    // First-person self-harm intents (explicit personal intent)
    const selfHarmFirstRe = /\b(I(?:'m| am)?\b[^\n]{0,60}\b(?:kill myself|end my life|want to die|suicid(e|al)|hurt myself|cut myself|overdose|can't go on))\b/i;
    // Third-party reports (someone else is trying to harm themselves)
    const selfHarmThirdRe = /\b(they|he|she|the patient|the client|the resident|the youth|participant)[^\n]{0,60}\b(?:kill themselves|kill himself|kill herself|hurt themselves|try to (?:kill|harm) (?:himself|herself|themselves)|trying to (?:kill|hurt|harm))\b/i;

    const violenceFirstRe = /\bI(?:'m| am)?\b[^\n]{0,60}\b(?:i will kill|i'm going to kill|i will hurt|i'm going to hurt|i want to hurt|i want to kill)\b/i;
    const violenceThirdRe = /\b(they|he|she|the patient|the resident|participant)[^\n]{0,60}\b(?:will kill|will hurt|threaten|attack)\b/i;

    if (selfHarmFirstRe.test(texts)) flags.push({ flag: 'self-harm', context: 'first-person' });
    if (selfHarmThirdRe.test(texts)) flags.push({ flag: 'self-harm', context: 'third-person' });
    if (violenceFirstRe.test(texts)) flags.push({ flag: 'violence', context: 'first-person' });
    if (violenceThirdRe.test(texts)) flags.push({ flag: 'violence', context: 'third-person' });

    // Broad sexual-violence mentions (treat as third-person unless first-person phrasing detected)
    const sexualRe = /(rape|sexual assault|molest|sexually assaulted)/i;
    if (sexualRe.test(texts)) {
        // rough heuristic: if 'I' near the word, mark first-person
        const firstNear = /\bI\b[^\n]{0,30}?(rape|sexual assault|molest|sexually assaulted)/i.test(texts);
        flags.push({ flag: 'sexual-violence', context: firstNear ? 'first-person' : 'third-person' });
    }

    return flags;
};

// Simple anonymization: replace common third-person pronouns and simple capitalized names with 'participant'.
const anonymizeMessages = (messages: Array<{ role?: string; text?: string }>) => {
    return messages.map(m => {
        let t = String(m.text || '');
        // Replace pronouns referring to others
        t = t.replace(/\b(he|she|they|him|her|them|his|hers|theirs|himself|herself|themselves)\b/gi, 'participant');
        // Replace words that look like names (simple heuristic: Capitalized words longer than 2 letters)
        t = t.replace(/\b([A-Z][a-z]{2,})\b/g, 'participant');
        // Replace tokens like 'the patient' or 'the client' with 'a participant'
        t = t.replace(/\bthe (patient|client|resident|youth)\b/gi, 'a participant');
        return { ...(m || {}), text: t };
    });
};

/**
 * chatVent: a supportive, non-judgmental vent/chat helper.
 * - Messages are ephemeral by default (caller should persist if desired).
 * - If first-person self-harm or first-person violent intent is detected, we refuse forwarding and return crisis guidance.
 * - If only third-person concerns are detected, we anonymize details and forward sanitized content to the model.
 */
export const chatVent = async (
    messages: Array<{ role?: 'user' | 'assistant' | string; text: string }>,
    options?: { model?: string }
): Promise<{ reply: string; safetyConcern?: boolean; concernFlags?: Array<{ flag: string; context: string }> }> => {
    try {
        const flags = detectSafetyConcerns(messages);
        // If any first-person self-harm or first-person violence flags, do not forward; provide crisis guidance.
        const hasFirstPersonDanger = flags.some(f => (f.flag === 'self-harm' || f.flag === 'violence' || f.flag === 'sexual-violence') && f.context === 'first-person');
        if (hasFirstPersonDanger) {
            const canned = `I'm really sorry — it sounds like someone may be at immediate risk. I can't assist with requests that encourage self-harm or harming others. If you or someone is in immediate danger, please call emergency services now. In the US call/text 988 for the Suicide & Crisis Lifeline. If you can, reach out to a colleague, supervisor, or trusted person. Would you like grounding exercises or contact resources?`;
            return { reply: canned, safetyConcern: true, concernFlags: flags };
        }

        // If only third-person concerns present, anonymize and forward sanitized transcript
        const hasThirdPersonOnly = flags.length > 0 && !hasFirstPersonDanger;
        const useMessages = hasThirdPersonOnly ? anonymizeMessages(messages) : messages;

        const systemInstruction = `You are a compassionate, non-judgmental listener for nurses. Keep responses brief, reflective, and supportive. Do not provide medical diagnoses or detailed clinical instructions. When discussing third-party clinical situations, respect privacy: avoid repeating identifying details and focus on supportive language for the caregiver.`;

        const convo = useMessages.map(m => `${m.role || 'user'}: ${m.text}`).join('\n');
        const model = options?.model || 'gemini-2.5-flash-lite';

        const response = await getAI().models.generateContent({
            model,
            contents: convo,
            config: {
                systemInstruction,
                temperature: 0.9,
                topP: 0.95,
                responseMimeType: 'text/plain'
            }
        });

        const text = response.text || '';
        return { reply: String(text).trim(), safetyConcern: false, concernFlags: flags };
    } catch (e) {
        console.error('chatVent error', e);
        return { reply: "Sorry, I couldn't process that right now.", safetyConcern: false, concernFlags: [] };
    }
};

// Simple assistant-style chat for the edit workflow.
// Returns a short assistant reply suitable to appear inline in the chat UI.
export const chatAssistant = async (
    messages: Array<{ role?: string; text?: string }>,
    options?: { model?: string }
): Promise<string> => {
    try {
        const systemInstruction = `You are a concise facilitation assistant. When given a short transcript of facilitator messages, respond with a brief, helpful reply that either (a) asks a clarifying question, (b) offers a short suggestion to improve the session, or (c) gives a one-line rewrite/example. Keep responses short (1-3 sentences). Do not include PHI or participant names.`;

        const convo = (messages || []).map(m => `${m.role || 'user'}: ${m.text}`).join('\n');
        const model = options?.model || 'gemini-2.5-flash-lite';

        const response = await getAI().models.generateContent({
            model,
            contents: convo,
            config: {
                systemInstruction,
                temperature: 0.6,
                topP: 0.9,
                responseMimeType: 'text/plain'
            }
        });

        return String(response.text || '').trim();
    } catch (e) {
        console.error('chatAssistant error', e);
        return '';
    }
};

// Helper to generate a single slot
const generateSlot = async (
    periodName: string,
    cohort: CohortState,
    risks: RiskFactor[],
    previousActivities: string[]
): Promise<SessionPlan> => {
    const activeRisks = risks.filter(r => r.active).map(r => `${r.label} (${r.description})`);
    
    const recent = getRecentActivityTitles(new Date().toLocaleDateString(), 3);
    const promptContext = `
    CURRENT DATE: ${new Date().toDateString()}
    TIME SLOT: ${periodName}
    
    COHORT DETAILS:
    - Count: ${cohort.count}
    - Age: ${cohort.ageRange}
    - Energy: ${cohort.energy}
    - Staff Count: ${cohort.staffCount} (CRITICAL CONSTRAINT)
    - Context: ${cohort.context || "None provided"}
    
    ACTIVE RISKS:
    ${activeRisks.length > 0 ? activeRisks.join('\n') : "Standard Unit Safety Protocols apply."}
    
    RECENT ACTIVITIES (past 3 days):
    ${recent.length > 0 ? recent.join('\n') : 'None recorded.'}
    
    PREVIOUS ACTIVITIES TODAY (DO NOT REPEAT):
    ${previousActivities.length > 0 ? previousActivities.join(', ') : "None yet."}
    
    Generate a detailed, practical session plan for this specific time slot. Avoid repeating recent activities unless you provide a clear variation and rationale.
    `;

    const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: promptContext,
        config: {
            systemInstruction: SINGLE_SLOT_SYSTEM_INSTRUCTION,
            temperature: 0.4,
            topP: 0.8,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                required: ["title", "instructions"],
                properties: {
                    title: { type: Type.STRING },
                    therapeuticGoal: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    safetyAlert: { type: Type.STRING },
                    nursePrep: { type: Type.ARRAY, items: { type: Type.STRING } },
                    toolAudit: { type: Type.ARRAY, items: { type: Type.STRING } },
                    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    duration: { type: Type.STRING },
                    alternativeOption: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            description: { type: Type.STRING }
                        }
                    }
                }
            }
        },
    });

    const text = response.text;
    if (!text) throw new Error(`Empty response for ${periodName}`);
    
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr);

    return {
        id: Math.random().toString(36).substr(2, 9),
        title: data.title || "Untitled Session",
        therapeuticGoal: data.therapeuticGoal || "Engagement",
        rationale: data.rationale || "",
        safetyAlert: data.safetyAlert || "Standard Safety Precautions",
        nursePrep: sanitizeList(data.nursePrep, 12),
        toolAudit: sanitizeList(data.toolAudit, 20),
        instructions: sanitizeList(data.instructions, 15),
        duration: data.duration || "60 mins",
        alternativeOption: data.alternativeOption || null
    };
};

export const generateDailyPlan = async (
  cohort: CohortState,
  risks: RiskFactor[]
): Promise<DailyPlan> => {
    const slots: TimeSlot[] = [];
    const periods = [
        "Morning (10:00 - 11:30)",
        "Afternoon (13:30 - 15:00)",
        "Late Afternoon (16:00 - 17:00)"
    ];
    
    // We strictly await sequentially to allow context passing (avoiding duplicates)
    for (const period of periods) {
        try {
            const previousTitles = slots.map(s => s.plan.title);
            const plan = await generateSlot(period, cohort, risks, previousTitles);
            slots.push({ period, plan });
        } catch (error) {
            console.error(`Failed to generate ${period}`, error);
            // Fallback for failed slot to prevent total crash
            slots.push({
                period,
                plan: {
                    id: Math.random().toString(36),
                    title: "Free Time / Ward Activities",
                    therapeuticGoal: "Relaxation",
                    rationale: "Automated generation failed for this slot. Defaulting to safe free time.",
                    safetyAlert: "Standard Protocols",
                    nursePrep: [],
                    toolAudit: [],
                    instructions: ["Supervised free time"],
                    duration: "60 mins"
                }
            });
        }
    }

    return {
        date: new Date().toLocaleDateString(),
        slots
    };
};

export const regenerateSession = async (
    currentPlan: SessionPlan,
    reason: string,
    cohort: CohortState,
    risks: RiskFactor[]
): Promise<SessionPlan> => {
    const activeRisks = risks.filter(r => r.active).map(r => r.label).join(", ");
    
    const prompt = `
    ORIGINAL ACTIVITY: ${currentPlan.title}
    REASON FOR CHANGE: ${reason}
    
    COHORT: ${cohort.count} Teens (${cohort.ageRange}), Energy: ${cohort.energy}, Staff: ${cohort.staffCount}
    ACTIVE RISKS: ${activeRisks || "Standard"}
    
    Generate a NEW, REPLACEMENT session plan that addresses the "Reason for Change".
    `;

    try {
        const response = await getAI().models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt,
            config: {
                systemInstruction: REGENERATE_SYSTEM_INSTRUCTION,
                temperature: 0.5,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        therapeuticGoal: { type: Type.STRING },
                        rationale: { type: Type.STRING },
                        safetyAlert: { type: Type.STRING },
                        nursePrep: { type: Type.ARRAY, items: { type: Type.STRING } },
                        toolAudit: { type: Type.ARRAY, items: { type: Type.STRING } },
                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        duration: { type: Type.STRING },
                        alternativeOption: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text || '';
        // Log raw response for debugging
        console.debug('Regenerate raw response:', text);

        let jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        if (!jsonStr) jsonStr = '{}';

        let newPlan: any = {};
        try {
            newPlan = JSON.parse(jsonStr);
        } catch (pe) {
            // Try to recover by extracting the first {...} block
            try {
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    const sub = jsonStr.slice(firstBrace, lastBrace + 1);
                    newPlan = JSON.parse(sub);
                    console.warn('Recovered JSON for regenerated session by substring extraction');
                } else {
                    console.warn('Could not locate JSON object in regenerate response. Falling back to defaults.');
                    newPlan = {};
                }
            } catch (subErr) {
                console.warn('Failed to parse regenerate response JSON, returning fallback.', pe, subErr);
                newPlan = {};
            }
        }

        return {
            id: currentPlan.id, // Keep ID to preserve slot position
            title: newPlan.title || "Revised Session",
            therapeuticGoal: newPlan.therapeuticGoal || "Engagement",
            rationale: newPlan.rationale || "Adjusted based on feedback",
            safetyAlert: newPlan.safetyAlert || "Check Safety Protocols",
            nursePrep: sanitizeList(newPlan.nursePrep, 12),
            toolAudit: sanitizeList(newPlan.toolAudit, 20),
            instructions: sanitizeList(newPlan.instructions, 15),
            duration: newPlan.duration || "60 mins",
            alternativeOption: newPlan.alternativeOption || null
        };
    } catch (error) {
        console.error("Regenerate Error", error);
        throw new Error("Could not regenerate session.");
    }
};

export const generateResource = async (
    activityTitle: string,
    cohort: CohortState
): Promise<PrintableResource> => {
    try {
        const response = await getAI().models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Create a printable resource for activity: "${activityTitle}". 
            Target Audience: Teens (Age ${cohort.ageRange}). 
            Vibe: ${cohort.energy}.`,
            config: {
                systemInstruction: RESOURCE_SYSTEM_INSTRUCTION,
                temperature: 0.6,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['worksheet', 'rules', 'guide'] },
                    content: { type: Type.STRING }
                  }
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response");
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr) as Partial<PrintableResource>;

        // Basic validation / fallback: if the model returned only a title (or empty content),
        // and the activity looks like a cooking session, create a simple recipe handout locally.
        const looksLikeCooking = /cook|cooking|kitchen|recipe|bake|baking/i.test(activityTitle);
        const hasContent = parsed.content && String(parsed.content).trim().length > 20;

        if (!hasContent && looksLikeCooking) {
            const safeTitle = parsed.title || activityTitle || "Cooking Activity";
            const fallbackContent = `# ${safeTitle}\n\n**Ingredients:**\n- 3 cups (example)\n- 1 tbsp (example)\n- Salt to taste\n\n**Equipment / Safety Notes:**\n- Use pre-cut or soft utensils if necessary. Nurse to supervise when using heat or sharp tools.\n- Avoid small / sharp items when swallowing risk is present.\n\n**Steps:**\n1. Prep ingredients (wash, measure)\n2. Demonstrate each step to the group\n3. Allow participants to complete steps with supervision\n4. Serve and debrief (what went well?)\n\n**Allergy & Risk Check:**\n- Confirm allergies before starting.\n`;

            return {
                title: safeTitle,
                type: (parsed.type as PrintableResource['type']) || 'guide',
                content: fallbackContent
            };
        }

        // If content exists or it's not a cooking session, return what the model provided,
        // but ensure required fields are present.
        return {
            title: parsed.title || activityTitle,
            type: (parsed.type as PrintableResource['type']) || 'worksheet',
            content: String(parsed.content || parsed.title || activityTitle)
        } as PrintableResource;

    } catch (error) {
        console.error("Resource Gen Error:", error);
        throw new Error("Could not generate resource.");
    }
}

export const generateExpandedSession = async (
    plan: SessionPlan,
    cohort: CohortState,
    risks: RiskFactor[],
    context?: string
): Promise<ExpandedSession> => {
    const activeRisks = risks.filter(r => r.active).map(r => `${r.label}: ${r.description}`);
    const recent = getRecentActivityTitles(new Date().toLocaleDateString(), 3);

    // Use the shared expanded-session system instruction constant so prompts stay consistent across the app
    const systemInstruction = EXPANDED_SESSION_SYSTEM_INSTRUCTION;

    const prompt = `SESSION PLAN:\n${JSON.stringify(plan, null, 2)}\n\nCOHORT:\n${JSON.stringify(cohort, null, 2)}\n\nACTIVE RISKS:\n${activeRisks.join('\n') || 'None'}\n\nRECENT ACTIVITIES (past 3 days):\n${recent.length > 0 ? recent.join('\n') : 'None recorded.'}\n\nCONTEXT:\n${context || 'None provided'}\n\nProduce the ExpandedSession JSON as described above. Avoid repeating recent activities unless a clear variation is provided. Be concise but concrete: use measurable quantities, clear step numbers, timings, and quick fallback branches.`;

    try {
        const response = await getAI().models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt,
            config: {
                systemInstruction,
                temperature: 0.45,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["specialist", "facilitatorScript", "printable"],
                    properties: {
                        specialist: { type: Type.STRING },
                        specialistRationale: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        facilitatorScript: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { stepNumber: { type: Type.NUMBER }, time: { type: Type.STRING }, step: { type: Type.STRING }, cues: { type: Type.STRING }, adlibs: { type: Type.STRING }, safetyChecks: { type: Type.STRING }, note: { type: Type.STRING } } } },
                        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                        therapeuticPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
                        accommodations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        sensoryConsiderations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        materials: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.STRING }, notes: { type: Type.STRING } } } },
                        riskMitigations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        branches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { trigger: { type: Type.STRING }, action: { type: Type.STRING } } } },
                        allergyChecks: { type: Type.STRING },
                        printable: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, type: { type: Type.STRING }, content: { type: Type.STRING } } }
                    }
                }
            }
        });

        const text = response.text || '';
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        // Log raw response for debugging when printable is missing or short
        console.debug('ExpandedSession raw response:', text);

        let parsed: Partial<ExpandedSession> & any = {};
        if (jsonStr) {
            try {
                parsed = JSON.parse(jsonStr) as Partial<ExpandedSession> & any;
            } catch (pe) {
                console.warn('Failed to parse expanded session JSON, will fallback to conservative defaults', pe, jsonStr.slice(0, 200));
                parsed = {};
            }
        } else {
            console.warn('Expanded session response empty');
            parsed = {};
        }

        // Basic validation and conservative fallbacks
        const specialist = parsed.specialist || 'Generalist';
        const specialistRationale = parsed.specialistRationale || `Specialist recommended based on activity: ${plan.title}`;
        const summary = parsed.summary || `Expanded session for ${plan.title}.`;
        const facilitatorScript = Array.isArray(parsed.facilitatorScript) && parsed.facilitatorScript.length > 0
            ? parsed.facilitatorScript
            : [{ stepNumber: 1, time: plan.duration, step: `Run activity: ${plan.title}`, safetyChecks: 'Use standard safety checks.' }];
        const tips = Array.isArray(parsed.tips) ? parsed.tips : [];
        const therapeuticPrompts = Array.isArray(parsed.therapeuticPrompts) ? parsed.therapeuticPrompts : [];
        const accommodations = Array.isArray(parsed.accommodations) ? parsed.accommodations : [];
        const sensoryConsiderations = Array.isArray(parsed.sensoryConsiderations) ? parsed.sensoryConsiderations : [];
        const riskMitigations = Array.isArray(parsed.riskMitigations) ? parsed.riskMitigations : [];
        const materials = Array.isArray(parsed.materials) ? parsed.materials : (plan.toolAudit || []).map((m: any) => ({ name: String(m) }));
        const branches = Array.isArray(parsed.branches) ? parsed.branches : [];
        const allergyChecks = typeof parsed.allergyChecks === 'string' ? parsed.allergyChecks : (parsed.allergyChecks ? String(parsed.allergyChecks) : 'Confirm allergies with each participant before starting.');

        // Ensure printable exists
        // Build a printable handout that includes measured materials and concrete steps.
        // If the model returned a short or unhelpful printable, synthesize a richer fallback.
        const hasPrintable = parsed.printable && parsed.printable.content && parsed.printable.title;
        const rawPrintableTitle = hasPrintable ? String(parsed.printable.title || '') : '';
        const rawPrintableContent = hasPrintable ? String(parsed.printable.content || '') : '';

        const buildFallbackPrintable = () => {
            const matLines = materials.map((m: any) => `- ${m.quantity ? m.quantity + ' ' : ''}${m.name}${m.notes ? ' — ' + m.notes : ''}`);
            const stepLines = facilitatorScript.map((s: any, idx: number) => {
                const num = s.stepNumber ?? (idx + 1);
                const time = s.time ? ` (${s.time})` : '';
                const cues = s.cues ? `\n  Cues: ${s.cues}` : '';
                const adlibs = s.adlibs ? `\n  Ad-libs: ${s.adlibs}` : '';
                const safety = s.safetyChecks ? `\n  Safety: ${s.safetyChecks}` : '';
                return `${num}. ${s.step}${time}${cues}${adlibs}${s.note ? `\n  Note: ${s.note}` : ''}${safety}`;
            });

            // Participant-facing simplified sheet
            const ageNote = (cohort && cohort.ageRange) ? `Suggested language for age: ${cohort.ageRange}` : '';
            const participantSteps = (stepLines.length > 0)
                ? stepLines.map(sl => sl.replace(/^\d+\.\s*/, '- ')).join('\n')
                : (plan.instructions || []).map((s: any) => `- ${s}`).join('\n');

            const participantPrompts = [] as string[];
            // small set of starter prompts for storytelling/creative work
            participantPrompts.push('If we were telling a story, start with: "Once there was..."');
            participantPrompts.push('What is one small thing you noticed today? Share it with the group.');
            participantPrompts.push('Try this: name three colors you see and describe one memory linked to a color.');
            if (therapeuticPrompts && therapeuticPrompts.length) participantPrompts.push(...therapeuticPrompts.slice(0,3));

            // Simple mindfulness micro-exercise
            const mindfulness = 'Breathing exercise (1 minute): Breathe in for 4 seconds, hold 2 seconds, breathe out for 6 seconds. Repeat 5 times.';

            // Heuristic starter activities and default materials when missing
            const titleLower = String(plan.title || '').toLowerCase();
            const looksLikeStory = /story|storytelling|narrat|tale|writing|poem/i.test(titleLower);
            const looksLikeArt = /draw|paint|art|collage|craft|sculpt/i.test(titleLower);
            const looksLikeCooking = materials.some((m: any) => /flour|sugar|egg|butter|milk|salt|recipe|cook|bake|stove|oven/i.test(m.name || '')) || /cook|cooking|recipe|bake|kitchen|meal|snack/i.test(titleLower);

            // Provide safe default materials if none detected
            let defaultMaterials: string[] = [];
            if (matLines.length === 0) {
                if (looksLikeCooking) defaultMaterials = ['Pre-measured ingredients (small portions)', 'Bowls & spoons', 'Paper towels', 'Nurse supervision for heat/use of utensils'];
                else if (looksLikeArt) defaultMaterials = ['Paper', 'Colored pencils/crayons', 'Glue stick', 'Scissors (safety)'];
                else defaultMaterials = ['Paper', 'Pens/pencils', 'Optional tactile items (soft ball, fabric swatches)'];
            }

            const starterActivities: string[] = [];
            if (looksLikeStory) {
                starterActivities.push('Quick warm-up: 1 sentence story round (go around and add one sentence each).');
                starterActivities.push('Provide a story starter card: "Once there was..." and invite responses.');
                starterActivities.push('Use pictures as prompts: ask participants to pick an image and tell one line about it.');
            } else if (looksLikeCooking) {
                starterActivities.push('Prep: check allergies, wash hands, set up stations with measured portions.');
                starterActivities.push('Demonstrate each small step and have participants repeat with supervision.');
                starterActivities.push('Serve and debrief: what tasted good or felt different?');
            } else if (looksLikeArt) {
                starterActivities.push('Show a finished example and break the activity into 3 small steps.');
                starterActivities.push('Offer a choice board with 2 options to reduce overwhelm.');
                starterActivities.push('Encourage simple prompts: draw your safe place, or draw a color that matches how you feel.');
            } else {
                starterActivities.push('Check-in: 1 minute per participant to name one feeling.');
                starterActivities.push('Simple group prompt: name 3 things you see around you.');
                starterActivities.push('Movement break: 30s stretch or shake-out.');
            }

            const parts = [
                `Participants: ${cohort.count || 'Group'} • ${ageNote}\n`,
                `# ${plan.title} - Facilitator Handout`,
                `\nSummary:\n${summary}`,
                `\nNurse Prep:\n- ${Array.isArray(tips) && tips.length ? tips.join('\n- ') : 'Prepare materials and review safety checks.'}`,
                `\nAllergy & Risk Check:\n${allergyChecks}`,
                `\nMaterials (for participants):\n${matLines.length > 0 ? matLines.join('\n') : defaultMaterials.join('\n')}`,
                `\nParticipant Steps (simple):\n${participantSteps || starterActivities.join('\n')}`,
                `\nStarter Activities / Prompts:\n- ${starterActivities.join('\n- ')}`,
                `\nParticipant Prompts & Starters:\n- ${participantPrompts.join('\n- ')}`,
                `\nMindfulness / Grounding:\n${mindfulness}`,
                `\nAccessibility / Adaptations:\n- ${accommodations.length ? accommodations.join('\n- ') : 'Offer one-on-one support, simplify steps, provide pre-cut materials where needed.'}`
            ];

            if (sensoryConsiderations.length) parts.push(`\nSensory Considerations:\n- ${sensoryConsiderations.join('\n- ')}`);
            if (riskMitigations && riskMitigations.length) parts.push(`\nRisk Mitigations:\n- ${riskMitigations.join('\n- ')}`);
            if (branches.length) parts.push(`\nIf things change:\n- ${branches.map((b: any) => `${b.trigger} → ${b.action}`).join('\n- ')}`);

            // Add a short recipe-style section if materials look like cooking
            if (looksLikeCooking) {
                const recipeLines = [
                    `\nRecipe (participant-friendly):`,
                    `- Prepare workspace and wash hands.`,
                    `- Follow steps above; use measured portions where possible.`,
                    `- Nurse oversight: supervise heat/use of sharp tools.`,
                ];
                parts.push(recipeLines.join('\n'));
            }

            // Include a short participant-facing header with age guidance
            if (ageNote) parts.unshift(`Participants: ${cohort.count || 'Group'} • ${ageNote}\n`);

            return {
                title: `${plan.title} - Facilitator & Participant Handout`,
                type: 'guide',
                content: parts.join('\n')
            } as PrintableResource;
        };

        let printable: PrintableResource;
        if (hasPrintable) {
            const contentTrim = rawPrintableContent.trim();
            // If content is too short or appears to be just a repeated title, synthesize a richer fallback
            const looksLikeTitleOnly = contentTrim.length < 80 || contentTrim.replace(/\s+/g, ' ').toLowerCase().includes(rawPrintableTitle.trim().toLowerCase());
            if (looksLikeTitleOnly) {
                printable = { title: rawPrintableTitle || `${plan.title} - Facilitator Handout`, type: (parsed.printable.type as PrintableResource['type']) || 'guide', content: buildFallbackPrintable().content };
            } else {
                printable = { title: rawPrintableTitle || `${plan.title} - Facilitator Handout`, type: (parsed.printable.type as PrintableResource['type']) || 'guide', content: rawPrintableContent };
            }
        } else {
            printable = buildFallbackPrintable();
        }

        // If any suggested material conflicts with active risks, add mitigation
        const conflictWarnings: string[] = [];
        for (const r of risks.filter(rr => rr.active)) {
            const low = r.label.toLowerCase();
            if (/swallow|pica/.test(low)) {
                const conflict = materials.find((m: any) => /small|bead|cap|button|pom-pom|seeds/i.test(m.name));
                if (conflict) conflictWarnings.push(`Avoid ${conflict.name} due to ${r.label}`);
            }
            if (/sharps/.test(low)) {
                const conflict = materials.find((m: any) => /scissor|knife|blade|glass/i.test(m.name));
                if (conflict) conflictWarnings.push(`Do not allow ${conflict.name} without nurse pre-cutting due to ${r.label}`);
            }
        }
        const finalRiskMitigations = [...riskMitigations, ...conflictWarnings];

        const expanded: ExpandedSession = {
            specialist,
            specialistRationale,
            summary,
            facilitatorScript,
            tips,
            therapeuticPrompts,
            accommodations,
            sensoryConsiderations,
            riskMitigations: finalRiskMitigations,
            materials,
            branches,
            allergyChecks,
            printable
        } as ExpandedSession;

        // If printable content looks too short, attempt one conservative retry with an explicit expansion prompt
        const printableIsShort = !expanded.printable || String(expanded.printable.content || '').trim().length < 200;
        if (printableIsShort) {
            try {
                console.info('Printable content short — retrying with explicit expansion prompt');
                const retryPrompt = `${systemInstruction}\n\nThe previously returned printable was too short. Expand the printable.content field to include: Materials, Clear Step-by-Step Participant Steps, Nurse Prep notes, and 3 Participant Prompts. Return ONLY valid JSON matching the schema. Original session plan:\n${JSON.stringify(plan, null, 2)}\nCOHORT:\n${JSON.stringify(cohort, null, 2)}\nACTIVE RISKS:\n${activeRisks.join('\n') || 'None'}`;
                const retryResp = await getAI().models.generateContent({
                    model: "gemini-2.5-flash-lite",
                    contents: retryPrompt,
                    config: { temperature: 0.1, responseMimeType: 'application/json' }
                });
                if (retryResp && retryResp.text) {
                    console.debug('ExpandedSession retry raw response:', retryResp.text);
                    const js = retryResp.text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsedRetry = JSON.parse(js) as any;
                    if (parsedRetry && parsedRetry.printable && parsedRetry.printable.content && String(parsedRetry.printable.content).trim().length >= 200) {
                        expanded.printable = parsedRetry.printable as PrintableResource;
                    }
                }
            } catch (retryErr) {
                console.warn('Retry to expand printable failed', retryErr);
            }
        }

        return expanded;

    } catch (error) {
        console.error('Expanded Session Gen Error:', error);
        // Conservative fallback: produce a minimal ExpandedSession based on original plan
        const printable: PrintableResource = {
            title: `${plan.title} - Facilitator Handout`,
            type: 'guide',
            content: `# ${plan.title}\n\nSummary:\n${plan.rationale || ''}\n\nMaterials:\n${(plan.toolAudit || []).join('\n') || 'None specified.'}\n\nSteps:\n${(plan.instructions || []).map((s, i) => `- ${i+1}. ${s}`).join('\n')}`
        };

        return {
            specialist: 'Generalist',
            specialistRationale: 'Fallback generalist expansion',
            summary: plan.rationale || 'No summary available.',
            facilitatorScript: [{ stepNumber: 1, time: plan.duration, step: plan.title, note: 'Fallback script' }],
            tips: [],
            riskMitigations: [],
            materials: (plan.toolAudit || []).map((m: any) => ({ name: String(m) })),
            branches: [],
            printable
        };
    }
};
