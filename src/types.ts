export interface EnergyDevice {
  id: string;
  name: string;
  watts: number;
  dailyHours: number;
}

export interface EnergyScenario {
  id: string;
  name: string;
  pricePerKwh: number;
  daysPerMonth: number;
  devices: EnergyDevice[];
  createdAt: string;
}

export interface DeductionRecord {
  id: string;
  scenarioId: string;
  scenarioName: string;
  createdAt: string;
  pricePerKwh: number;
  daysPerMonth: number;
  devices: EnergyDevice[];
  total: EnergyEstimate;
}

export interface RecordComparison {
  base: DeductionRecord;
  target: DeductionRecord;
  deltaDailyKwh: number;
  deltaMonthlyKwh: number;
  deltaMonthlyCost: number;
  addedDevices: EnergyDevice[];
  removedDevices: EnergyDevice[];
  changedDevices: Array<{ before: EnergyDevice; after: EnergyDevice }>;
  unchangedCount: number;
}

export interface EnergyDocument {
  version: 1;
  scenarios: EnergyScenario[];
  activeScenarioId: string;
  records?: DeductionRecord[];
}

export type ViewStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface EnergyEstimate {
  dailyKwh: number;
  monthlyKwh: number;
  monthlyCost: number;
}

export interface ScenarioSummary {
  total: EnergyEstimate;
  devices: Array<EnergyDevice & EnergyEstimate & { share: number }>;
}
