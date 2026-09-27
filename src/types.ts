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

export interface EnergyDocument {
  version: 1;
  scenarios: EnergyScenario[];
  activeScenarioId: string;
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

/** 一次“完成推演”留下的历史记录 */
export interface SimulationRecord {
  id: string;
  /** 记录生成时间（ISO 字符串） */
  completedAt: string;
  scenarioId: string;
  scenarioName: string;
  pricePerKwh: number;
  daysPerMonth: number;
  deviceCount: number;
  devices: SimulationRecordDevice[];
  result: EnergyEstimate;
}

export interface SimulationRecordDevice {
  id: string;
  name: string;
  watts: number;
  dailyHours: number;
  estimate: EnergyEstimate;
  /** 该设备占当时总用电量的比例 */
  share: number;
}
