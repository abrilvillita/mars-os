/** Mission Lab state: what you send, where, with which assumptions, and saved sites to compare. */
import { create } from 'zustand';
import { DEFAULT_INPUTS, type MissionInputs } from '../core/mission/missionModel';

export interface MissionSite {
  lat: number;
  lon: number;
}

export interface MissionAIResult {
  verdict: 'yes' | 'partly' | 'no';
  summary: { en: string; es: string };
  risks: { en: string; es: string }[];
  suggestions: { en: string; es: string }[];
  model: string;
  at: string;
}

interface MissionState {
  inputs: MissionInputs;
  site: MissionSite | null;
  picking: boolean;
  question: string;
  saved: { A: (MissionSite & { label: string }) | null; B: (MissionSite & { label: string }) | null };
  ai: MissionAIResult | null;
  aiStatus: 'idle' | 'running' | 'error';
  aiError: string | null;
  set: (p: Partial<MissionState>) => void;
}

export const useMission = create<MissionState>((set) => ({
  inputs: { ...DEFAULT_INPUTS },
  site: null,
  picking: false,
  question: '',
  saved: { A: null, B: null },
  ai: null,
  aiStatus: 'idle',
  aiError: null,
  set: (p) => set(p),
}));
