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
}

export interface AppState {
  cohort: CohortState;
  risks: RiskFactor[];
  dailyPlan: DailyPlan | null;
  loading: boolean;
  error: string | null;
}