import type { DeductionRecord, EnergyDevice, EnergyEstimate, EnergyScenario, RecordComparison, ScenarioSummary } from './types';

export const MAX_DAILY_HOURS = 24;
export const MAX_DEDUCTION_RECORDS = 20;

export const exampleScenario: EnergyScenario = {
  id: 'scenario-home',
  name: '夏日居家方案',
  pricePerKwh: 0.62,
  daysPerMonth: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  devices: [
    { id: 'device-aircon', name: '客厅空调', watts: 1200, dailyHours: 6 },
    { id: 'device-fridge', name: '冰箱', watts: 150, dailyHours: 10 },
    { id: 'device-lamp', name: '书桌台灯', watts: 12, dailyHours: 5 },
  ],
};

export function estimateDevice(device: EnergyDevice, daysPerMonth: number, pricePerKwh: number): EnergyEstimate {
  const dailyKwh = (device.watts * device.dailyHours) / 1000;
  const monthlyKwh = dailyKwh * daysPerMonth;
  return { dailyKwh, monthlyKwh, monthlyCost: monthlyKwh * pricePerKwh };
}

export function summarizeScenario(scenario: EnergyScenario): ScenarioSummary {
  const devices = scenario.devices.map((device) => ({
    ...device,
    ...estimateDevice(device, scenario.daysPerMonth, scenario.pricePerKwh),
    share: 0,
  }));
  const total = devices.reduce(
    (sum, device) => ({
      dailyKwh: sum.dailyKwh + device.dailyKwh,
      monthlyKwh: sum.monthlyKwh + device.monthlyKwh,
      monthlyCost: sum.monthlyCost + device.monthlyCost,
    }),
    { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 },
  );
  return {
    total,
    devices: devices.map((device) => ({ ...device, share: total.monthlyKwh ? device.monthlyKwh / total.monthlyKwh : 0 })),
  };
}

export function validateDevice(device: Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>): string | null {
  if (!device.name.trim()) return '请填写设备名称';
  if (!Number.isFinite(device.watts) || device.watts < 0) return '功率不能为负数';
  if (!Number.isFinite(device.dailyHours) || device.dailyHours < 0) return '使用时间不能为负数';
  if (device.dailyHours > MAX_DAILY_HOURS) return '每日使用时间不能超过 24 小时';
  return null;
}

export function validateScenarioSettings(pricePerKwh: number, daysPerMonth: number): string | null {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh < 0) return '电价不能为负数';
  if (!Number.isFinite(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) return '计费天数需在 1–31 天之间';
  return null;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function cloneScenario(source: EnergyScenario, id: string, name: string): EnergyScenario {
  return { ...source, id, name, createdAt: new Date().toISOString(), devices: source.devices.map((device) => ({ ...device, id: `${id}-${device.id}` })) };
}

export function createDeductionRecord(scenario: EnergyScenario, now = new Date()): DeductionRecord {
  const { total } = summarizeScenario(scenario);
  return {
    id: `record-${now.getTime()}`,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    createdAt: now.toISOString(),
    pricePerKwh: scenario.pricePerKwh,
    daysPerMonth: scenario.daysPerMonth,
    devices: scenario.devices.map((device) => ({ ...device })),
    total: { ...total },
  };
}

export function appendDeductionRecord(records: DeductionRecord[], record: DeductionRecord): DeductionRecord[] {
  return [...records, record].slice(-MAX_DEDUCTION_RECORDS);
}

export function compareDeductionRecords(base: DeductionRecord, target: DeductionRecord): RecordComparison {
  const unmatched = target.devices.map((device) => ({ ...device }));
  const takeMatch = (device: EnergyDevice): EnergyDevice | undefined => {
    const byId = unmatched.findIndex((candidate) => candidate.id === device.id);
    const index = byId >= 0 ? byId : unmatched.findIndex((candidate) => candidate.name === device.name);
    return index >= 0 ? unmatched.splice(index, 1)[0] : undefined;
  };
  const removedDevices: EnergyDevice[] = [];
  const changedDevices: RecordComparison['changedDevices'] = [];
  let unchangedCount = 0;
  for (const device of base.devices) {
    const match = takeMatch(device);
    if (!match) {
      removedDevices.push({ ...device });
    } else if (match.name === device.name && match.watts === device.watts && match.dailyHours === device.dailyHours) {
      unchangedCount += 1;
    } else {
      changedDevices.push({ before: { ...device }, after: match });
    }
  }
  return {
    base,
    target,
    deltaDailyKwh: target.total.dailyKwh - base.total.dailyKwh,
    deltaMonthlyKwh: target.total.monthlyKwh - base.total.monthlyKwh,
    deltaMonthlyCost: target.total.monthlyCost - base.total.monthlyCost,
    addedDevices: unmatched,
    removedDevices,
    changedDevices,
    unchangedCount,
  };
}

export function formatRecordTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
