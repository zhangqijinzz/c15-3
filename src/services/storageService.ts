import type { DeductionRecord, EnergyDocument } from '../types';

const STORAGE_KEY = 'energy-lens.document.v1';

export function readDocument(): EnergyDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDocument(parsed)) return null;
    return { ...parsed, records: sanitizeRecords(parsed.records) };
  } catch {
    return null;
  }
}

export function writeDocument(document: EnergyDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
}

function isDocument(value: unknown): value is EnergyDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EnergyDocument>;
  return candidate.version === 1
    && typeof candidate.activeScenarioId === 'string'
    && Array.isArray(candidate.scenarios)
    && candidate.scenarios.length > 0
    && candidate.scenarios.every(isScenario)
    && candidate.scenarios.some((scenario) => scenario.id === candidate.activeScenarioId);
}

function isScenario(value: unknown): value is EnergyDocument['scenarios'][number] {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as Partial<EnergyDocument['scenarios'][number]>;
  return typeof scenario.id === 'string'
    && typeof scenario.name === 'string'
    && typeof scenario.createdAt === 'string'
    && typeof scenario.pricePerKwh === 'number'
    && scenario.pricePerKwh >= 0
    && typeof scenario.daysPerMonth === 'number'
    && scenario.daysPerMonth >= 1
    && scenario.daysPerMonth <= 31
    && Array.isArray(scenario.devices)
    && scenario.devices.length > 0
    && scenario.devices.every(isDevice);
}

function isDevice(value: unknown): value is EnergyDocument['scenarios'][number]['devices'][number] {
  if (!value || typeof value !== 'object') return false;
  const device = value as Partial<EnergyDocument['scenarios'][number]['devices'][number]>;
  return typeof device.id === 'string'
    && typeof device.name === 'string'
    && typeof device.watts === 'number'
    && device.watts >= 0
    && typeof device.dailyHours === 'number'
    && device.dailyHours >= 0
    && device.dailyHours <= 24;
}

function sanitizeRecords(value: unknown): DeductionRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is DeductionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<DeductionRecord>;
  return typeof record.id === 'string'
    && typeof record.scenarioId === 'string'
    && typeof record.scenarioName === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.pricePerKwh === 'number'
    && record.pricePerKwh >= 0
    && typeof record.daysPerMonth === 'number'
    && record.daysPerMonth >= 1
    && record.daysPerMonth <= 31
    && Array.isArray(record.devices)
    && record.devices.every(isDevice)
    && isEstimate(record.total);
}

function isEstimate(value: unknown): value is DeductionRecord['total'] {
  if (!value || typeof value !== 'object') return false;
  const total = value as Partial<DeductionRecord['total']>;
  return typeof total.dailyKwh === 'number' && Number.isFinite(total.dailyKwh)
    && typeof total.monthlyKwh === 'number' && Number.isFinite(total.monthlyKwh)
    && typeof total.monthlyCost === 'number' && Number.isFinite(total.monthlyCost);
}
