export type PollutantKey = 'pm25' | 'pm10' | 'no2' | 'so2' | 'o3' | 'co';

export type AqiCategory = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';

export interface PollutantReadings {
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  o3: number;
  /** Raw Carbon Monoxide in µg/m³ (matching Open-Meteo Air Quality API). Converted internally to mg/m³ for CPCB NAQI. */
  coUgM3: number;
}

export interface CpcbAqiResult {
  aqi: number;
  category: AqiCategory;
  dominantPollutant: PollutantKey;
  subIndices: Record<PollutantKey, number>;
  advisory: string;
}

export interface HourlyAirPoint {
  time: string;
  hourLabel: string;
  endHourLabel?: string;
  pm25: number;
  pm10: number;
  aqi: number;
}

export interface CleanAirWindowAnalysis {
  bestWindow: {
    startLabel: string;
    endLabel: string;
    avgPm25: number;
    avgAqi: number;
    advice: string;
  };
  worstWindow: {
    startLabel: string;
    endLabel: string;
    avgPm25: number;
    avgAqi: number;
    advice: string;
  };
  exposureSavingsPct: number;
}

export interface LocationOption {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

export interface GroundStationOverlay {
  stationName: string;
  provider: string;
  distanceKm: number | null;
  pm25: number | null;
  lastUpdated: string | null;
}

export interface AirQualityPayload {
  location: LocationOption;
  fetchedAt: string;
  source: string;
  current: PollutantReadings;
  cpcb: CpcbAqiResult;
  hourly: HourlyAirPoint[];
  windowAnalysis: CleanAirWindowAnalysis;
  groundStation: GroundStationOverlay | null;
}

export type CommuteMode = 'solo_car' | 'scooter' | 'bus' | 'metro' | 'cycle_walk' | 'wfh';
export type BudgetTier = 'zero_cost' | 'budget_diy' | 'standard';

export interface HouseholdProfile {
  householdMembers: string[];
  baselineCommute: CommuteMode;
  chosenCommute: CommuteMode;
  commuteKm: number;
  homeType: 'apartment' | 'independent_house' | 'shared_flat';
  budgetTier: BudgetTier;
}

export interface ChoiceToggles {
  hepaOrCorsiRosenthal: boolean;
  smartVentilation: boolean;
  cleanCookingExhaust: boolean;
  n95OutdoorMask: boolean;
  publicTransitOrWfhSwap: boolean;
  zeroSmokeIndoor: boolean;
}

export interface ImpactBreakdownItem {
  label: string;
  detail: string;
  exposureDeltaPct: number;
  co2SavedKgPerYear: number;
}

export interface ChoiceImpactResult {
  baselineDailyExposureUgM3: number;
  projectedDailyExposureUgM3: number;
  exposureReductionPct: number;
  dailyCo2SavedKg: number;
  annualCo2SavedKg: number;
  treesEquivalentPerYear: number;
  breakdown: ImpactBreakdownItem[];
}

export type RoomSizeId = 'small_bedroom' | 'master_bedroom' | 'living_room';
export type FiltrationSetupId = 'sealed_only' | 'corsi_rosenthal' | 'true_hepa';

export interface RoomSizePreset {
  id: RoomSizeId;
  label: string;
  shortLabel: string;
  areaSqFt: number;
  ceilingFt: number;
  volumeCuFt: number;
  volumeM3: number;
}

export interface FiltrationPreset {
  id: FiltrationSetupId;
  label: string;
  shortLabel: string;
  cadrM3h: number;
  equilibriumFactor: number;
  summary: string;
}

export interface RoomCleanPoint {
  minute: number;
  pm25: number;
}

export interface RoomCleanSimulation {
  room: RoomSizePreset;
  filtration: FiltrationPreset;
  ambientPm25: number;
  points: RoomCleanPoint[];
  startPm25: number;
  endPm25At120Min: number;
  equilibriumPm25: number;
  ach: number;
  targetPm25: 30;
  minutesToSafe: number | null;
  headline: string;
}

export type LlmProviderName = 'gemini' | 'huggingface' | 'groq' | 'deterministic-fallback';

export interface RoutineStep {
  timeBlock: string;
  action: string;
  whyItHelps: string;
}

export interface IndoorHack {
  title: string;
  steps: string;
  costTier: string;
  impact: string;
}

export interface SustainableSwap {
  swap: string;
  directImpact: string;
}

export interface AssistantPlan {
  provider: LlmProviderName;
  modelLabel: string;
  debugReason?: string;
  summary: string;
  dailyRoutine: RoutineStep[];
  indoorHacks: IndoorHack[];
  sustainableSwaps: SustainableSwap[];
  safetyNote: string;
}

export interface PlaybookTip {
  id: string;
  title: string;
  category: 'indoor-hack' | 'low-emission-routine' | 'sustainable-swap' | 'health-protection';
  costTier: BudgetTier;
  summary: string;
  steps: string;
  impactMetric: string;
  keywords: string[];
  sourceLabel: string;
  sourceUrl: string;
}
