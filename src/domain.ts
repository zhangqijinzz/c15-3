import type { EnergyDevice, EnergyEstimate, EnergyScenario, ScenarioSummary, SimulationRecord, SimulationRecordDevice } from './types';

export const MAX_DAILY_HOURS = 24;

/** 推演记录的保留上限，超出后按时间丢弃最早的 */
export const MAX_RECORDS = 20;

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

/** 在完成推演时，把当时的设备明细、计费参数和用电结论固化成一条记录 */
export function createSimulationRecord(scenario: EnergyScenario, now: Date = new Date()): SimulationRecord {
  const summary = summarizeScenario(scenario);
  const devices: SimulationRecordDevice[] = summary.devices.map((device) => ({
    id: device.id,
    name: device.name,
    watts: device.watts,
    dailyHours: device.dailyHours,
    estimate: { dailyKwh: device.dailyKwh, monthlyKwh: device.monthlyKwh, monthlyCost: device.monthlyCost },
    share: device.share,
  }));
  return {
    id: `record-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    completedAt: now.toISOString(),
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    pricePerKwh: scenario.pricePerKwh,
    daysPerMonth: scenario.daysPerMonth,
    deviceCount: devices.length,
    devices,
    result: { ...summary.total },
  };
}

/** 追加一条记录并执行保留策略：超出上限时按完成时间丢弃最早的 */
export function appendSimulationRecord(records: readonly SimulationRecord[], record: SimulationRecord, limit = MAX_RECORDS): SimulationRecord[] {
  return [...records, record]
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .slice(-limit);
}

export interface MetricDelta {
  before: number;
  after: number;
  /** after - before */
  delta: number;
}

export interface RecordDeviceDelta {
  key: string;
  beforeName: string | null;
  afterName: string | null;
  beforeMonthlyKwh: number | null;
  afterMonthlyKwh: number | null;
  monthlyKwhDelta: number | null;
}

export interface SimulationRecordComparison {
  /** 时间较早的一条 */
  earlier: SimulationRecord;
  /** 时间较晚的一条 */
  later: SimulationRecord;
  dailyKwh: MetricDelta;
  monthlyKwh: MetricDelta;
  monthlyCost: MetricDelta;
  deviceCount: MetricDelta;
  pricePerKwh: MetricDelta;
  daysPerMonth: MetricDelta;
  deviceDeltas: RecordDeviceDelta[];
}

/**
 * 对比两条记录。按完成时间自动确定先后（较早的为基准）。
 * 设备优先按 id 配对，对不上再按名称配对，仍对不上的分别列为新增 / 移除。
 */
export function compareSimulationRecords(one: SimulationRecord, other: SimulationRecord): SimulationRecordComparison {
  const [earlier, later] = one.completedAt <= other.completedAt ? [one, other] : [other, one];
  const delta = (before: number, after: number): MetricDelta => ({ before, after, delta: after - before });

  const deviceDeltas: RecordDeviceDelta[] = [];
  const laterMatched = new Set<string>();

  for (const beforeDevice of earlier.devices) {
    const afterDevice = later.devices.find((item) => item.id === beforeDevice.id)
      ?? later.devices.find((item) => !laterMatched.has(item.id) && item.name === beforeDevice.name)
      ?? null;
    if (afterDevice) laterMatched.add(afterDevice.id);
    deviceDeltas.push({
      key: afterDevice?.id ?? beforeDevice.id,
      beforeName: beforeDevice.name,
      afterName: afterDevice?.name ?? null,
      beforeMonthlyKwh: beforeDevice.estimate.monthlyKwh,
      afterMonthlyKwh: afterDevice?.estimate.monthlyKwh ?? null,
      monthlyKwhDelta: afterDevice ? afterDevice.estimate.monthlyKwh - beforeDevice.estimate.monthlyKwh : null,
    });
  }

  for (const afterDevice of later.devices) {
    if (laterMatched.has(afterDevice.id)) continue;
    deviceDeltas.push({
      key: afterDevice.id,
      beforeName: null,
      afterName: afterDevice.name,
      beforeMonthlyKwh: null,
      afterMonthlyKwh: afterDevice.estimate.monthlyKwh,
      monthlyKwhDelta: null,
    });
  }

  return {
    earlier,
    later,
    dailyKwh: delta(earlier.result.dailyKwh, later.result.dailyKwh),
    monthlyKwh: delta(earlier.result.monthlyKwh, later.result.monthlyKwh),
    monthlyCost: delta(earlier.result.monthlyCost, later.result.monthlyCost),
    deviceCount: delta(earlier.deviceCount, later.deviceCount),
    pricePerKwh: delta(earlier.pricePerKwh, later.pricePerKwh),
    daysPerMonth: delta(earlier.daysPerMonth, later.daysPerMonth),
    deviceDeltas,
  };
}

/** 把 ISO 时间格式化成便于回看的本地时间，例如 2026/09/27 14:30 */
export function formatRecordTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
