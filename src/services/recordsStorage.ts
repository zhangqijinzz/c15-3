import type { EnergyEstimate, SimulationRecord, SimulationRecordDevice } from '../types';

const STORAGE_KEY = 'energy-lens.records.v1';

export function readRecords(): SimulationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  } catch {
    return [];
  }
}

export function writeRecords(records: readonly SimulationRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function isRecord(value: unknown): value is SimulationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SimulationRecord>;
  return typeof record.id === 'string'
    && typeof record.completedAt === 'string'
    && typeof record.scenarioId === 'string'
    && typeof record.scenarioName === 'string'
    && typeof record.pricePerKwh === 'number'
    && record.pricePerKwh >= 0
    && typeof record.daysPerMonth === 'number'
    && record.daysPerMonth >= 1
    && record.daysPerMonth <= 31
    && typeof record.deviceCount === 'number'
    && isEstimate(record.result)
    && Array.isArray(record.devices)
    && record.devices.length > 0
    && record.devices.every(isRecordDevice);
}

function isRecordDevice(value: unknown): value is SimulationRecordDevice {
  if (!value || typeof value !== 'object') return false;
  const device = value as Partial<SimulationRecordDevice>;
  return typeof device.id === 'string'
    && typeof device.name === 'string'
    && typeof device.watts === 'number'
    && device.watts >= 0
    && typeof device.dailyHours === 'number'
    && device.dailyHours >= 0
    && device.dailyHours <= 24
    && typeof device.share === 'number'
    && isEstimate(device.estimate);
}

function isEstimate(value: unknown): value is EnergyEstimate {
  if (!value || typeof value !== 'object') return false;
  const estimate = value as Partial<EnergyEstimate>;
  return typeof estimate.dailyKwh === 'number'
    && typeof estimate.monthlyKwh === 'number'
    && typeof estimate.monthlyCost === 'number';
}
