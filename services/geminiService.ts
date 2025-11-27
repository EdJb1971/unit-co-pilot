import { GoogleGenAI, Type } from "@google/genai";
import { SINGLE_SLOT_SYSTEM_INSTRUCTION, RESOURCE_SYSTEM_INSTRUCTION, REGENERATE_SYSTEM_INSTRUCTION } from "../constants";
import { CohortState, RiskFactor, DailyPlan, PrintableResource, SessionPlan, TimeSlot } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to sanitize potentially crazy lists from AI
const sanitizeList = (list: any, maxItems: number): string[] => {
    if (!Array.isArray(list)) return [];
    return list.slice(0, maxItems).map(item => String(item));
};

// Helper to generate a single slot
const generateSlot = async (
    periodName: string,
    cohort: CohortState,
    risks: RiskFactor[],
    previousActivities: string[]
): Promise<SessionPlan> => {
    const activeRisks = risks.filter(r => r.active).map(r => `${r.label} (${r.description})`);
    
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
    
    PREVIOUS ACTIVITIES TODAY (DO NOT REPEAT):
    ${previousActivities.length > 0 ? previousActivities.join(', ') : "None yet."}
    
    Generate a detailed session plan for this specific time slot.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: promptContext,
        config: {
            systemInstruction: SINGLE_SLOT_SYSTEM_INSTRUCTION,
            temperature: 0.4,
            topP: 0.8,
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
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
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

        const text = response.text;
        const jsonStr = text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
        const newPlan = JSON.parse(jsonStr);

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
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
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
        return JSON.parse(jsonStr) as PrintableResource;

    } catch (error) {
        console.error("Resource Gen Error:", error);
        throw new Error("Could not generate resource.");
    }
}
