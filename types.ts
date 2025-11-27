export enum RiskLevel {
  NONE = 'None',
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

export interface RiskFactor {
  id: string;
  label: string;
  description: string;
  active: boolean;
  severity: RiskLevel;
}

export enum EnergyLevel {
  LOW = 'Low / Depressed',
  MIXED = 'Mixed / Unsettled',
  HIGH = 'High / Manic',
  AGITATED = 'Agitated / Aggressive'
}

export interface CohortState {
  count: number;
  ageRange: string; // e.g., "12-16"
  energy: EnergyLevel;
  context: string; // e.g., "Raining outside", "Christmas week"
  staffCount: number; // New: Available staff affects safety logic
}

export interface PrintableResource {
  title: string;
  content: string; // Markdown/Text content for the worksheet
  type: 'worksheet' | 'guide' | 'rules';
}

export interface ExpandedSession {
  specialist: string; // e.g., "Baker", "Nutritionist", "Psychologist"
  specialistRationale: string; // short explanation for specialist choice
  summary: string; // one-paragraph clinical summary
  // Detailed step-by-step script with optional timing, cues and ad-libs
  facilitatorScript: Array<{ stepNumber?: number; time?: string; step: string; cues?: string; adlibs?: string; note?: string; safetyChecks?: string }>;
  tips: string[]; // engagement tips
  riskMitigations: string[]; // specific mitigations for identified risks
  // Materials with optional quantity and notes (e.g., { name: 'flour', quantity: '2 cups', notes: 'sifted' })
  materials: Array<{ name: string; quantity?: string; notes?: string }>;
  branches: Array<{ trigger: string; action: string }>; // adaptive branches
  // Therapeutic prompts, accommodations, sensory considerations, and allergy checklist
  therapeuticPrompts?: string[];
  accommodations?: string[];
  sensoryConsiderations?: string[];
  allergyChecks?: string;
  printable: PrintableResource; // ready-to-print handout
}

export interface SessionPlan {
  id: string; // Added ID for tracking
  title: string;
  therapeuticGoal: string; 
  rationale: string; 
  safetyAlert: string; 
  nursePrep: string[]; 
  toolAudit: string[]; 
  instructions: string[]; 
  duration: string;
  alternativeOption?: { // Brief alternative if the main one fails
    title: string;
    description: string;
  };
}

export interface TimeSlot {
  period: string; // e.g. "Morning (10:00 - 11:30)"
  plan: SessionPlan;
}

export interface DailyPlan {
  date: string;
  slots: TimeSlot[];
  lastModified?: number; // epoch ms — used for conflict detection/merge
}

export interface ChatMessage {
  id: string;
  role: 'nurse' | 'assistant';
  text: string;
  ts: number;
}

export interface ChatTranscript {
  id: string;
  date: string; // toLocaleDateString()
  slotId: string;
  messages: ChatMessage[];
  lastModified?: number;
}

export interface ChangeRecord {
  id: string;
  date: string;
  slotId: string;
  author: string; // e.g., 'nurse'
  timestamp: number;
  diff: Record<string, { before: any; after: any }>;
  accepted: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface PlanVersion {
  id: string;
  date: string;
  timestamp: number;
  author?: string;
  description?: string;
  plan: DailyPlan;
}

export interface AppState {
  cohort: CohortState;
  risks: RiskFactor[];
  dailyPlan: DailyPlan | null;
  loading: boolean;
  error: string | null;
}