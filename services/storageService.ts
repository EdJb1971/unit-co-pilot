import { DailyPlan } from '../types';

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
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Failed to load plan from storage", e);
    return null;
  }
};

export const hasPlanForDate = (date: string): boolean => {
    return !!localStorage.getItem(`${STORAGE_PREFIX}${date}`);
}