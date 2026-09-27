import { describe, expect, it } from 'vitest';
import { appendDeductionRecord, compareDeductionRecords, createDeductionRecord, estimateDevice, MAX_DEDUCTION_RECORDS, summarizeScenario, validateDevice } from '../domain';
import type { DeductionRecord, EnergyScenario } from '../types';

describe('energy domain', () => {
  it('calculates kWh and cost from watts, hours, days and price', () => {
    const result = estimateDevice({ id: 'a', name: '空调', watts: 1000, dailyHours: 2 }, 30, 0.5);
    expect(result).toEqual({ dailyKwh: 2, monthlyKwh: 60, monthlyCost: 30 });
  });

  it('keeps device shares explainable and sums to 100%', () => {
    const scenario: EnergyScenario = { id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: 'a', watts: 100, dailyHours: 1 }, { id: 'b', name: 'b', watts: 300, dailyHours: 1 },
    ] };
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe(12);
    expect(summary.devices.map((device) => device.share)).toEqual([0.25, 0.75]);
  });

  it('rejects negative power and more than 24 hours', () => {
    expect(validateDevice({ name: 'x', watts: -1, dailyHours: 1 })).toBe('功率不能为负数');
    expect(validateDevice({ name: 'x', watts: 1, dailyHours: 24.1 })).toBe('每日使用时间不能超过 24 小时');
  });
});

describe('deduction records', () => {
  const scenario: EnergyScenario = { id: 's', name: '居家', pricePerKwh: 0.5, daysPerMonth: 30, createdAt: '', devices: [
    { id: 'a', name: '空调', watts: 1000, dailyHours: 2 }, { id: 'b', name: '冰箱', watts: 100, dailyHours: 10 },
  ] };

  it('snapshots devices, billing params and totals at completion time', () => {
    const record = createDeductionRecord(scenario, new Date('2026-02-01T08:00:00.000Z'));
    expect(record.createdAt).toBe('2026-02-01T08:00:00.000Z');
    expect(record.scenarioName).toBe('居家');
    expect(record.pricePerKwh).toBe(0.5);
    expect(record.daysPerMonth).toBe(30);
    expect(record.devices).toEqual(scenario.devices);
    expect(record.devices).not.toBe(scenario.devices);
    expect(record.total).toEqual({ dailyKwh: 3, monthlyKwh: 90, monthlyCost: 45 });
  });

  it('appends records and trims the oldest beyond the retention limit', () => {
    let records: DeductionRecord[] = [];
    for (let index = 0; index < MAX_DEDUCTION_RECORDS + 5; index += 1) {
      records = appendDeductionRecord(records, createDeductionRecord(scenario, new Date(2026, 0, 1, 0, index)));
    }
    expect(records).toHaveLength(MAX_DEDUCTION_RECORDS);
    expect(records[0].createdAt).toBe(new Date(2026, 0, 1, 0, 5).toISOString());
    expect(records[records.length - 1].createdAt).toBe(new Date(2026, 0, 1, 0, MAX_DEDUCTION_RECORDS + 4).toISOString());
  });

  it('compares two records on totals and device structure', () => {
    const before = createDeductionRecord(scenario, new Date('2026-02-01T08:00:00.000Z'));
    const afterScenario: EnergyScenario = { ...scenario, pricePerKwh: 0.8, devices: [
      { id: 'a', name: '空调', watts: 1000, dailyHours: 4 },
      { id: 'c', name: '烘干机', watts: 800, dailyHours: 1 },
    ] };
    const after = createDeductionRecord(afterScenario, new Date('2026-03-01T08:00:00.000Z'));
    const comparison = compareDeductionRecords(before, after);
    expect(comparison.deltaMonthlyKwh).toBeCloseTo(after.total.monthlyKwh - before.total.monthlyKwh);
    expect(comparison.deltaMonthlyCost).toBeCloseTo(after.total.monthlyCost - before.total.monthlyCost);
    expect(comparison.addedDevices.map((device) => device.name)).toEqual(['烘干机']);
    expect(comparison.removedDevices.map((device) => device.name)).toEqual(['冰箱']);
    expect(comparison.changedDevices).toHaveLength(1);
    expect(comparison.changedDevices[0].before.dailyHours).toBe(2);
    expect(comparison.changedDevices[0].after.dailyHours).toBe(4);
    expect(comparison.unchangedCount).toBe(0);
  });

  it('matches devices across scenarios by name when ids differ', () => {
    const before = createDeductionRecord(scenario, new Date('2026-02-01T08:00:00.000Z'));
    const renamed: EnergyScenario = { ...scenario, id: 's2', devices: scenario.devices.map((device, index) => ({ ...device, id: `copy-${index}` })) };
    const after = createDeductionRecord(renamed, new Date('2026-03-01T08:00:00.000Z'));
    const comparison = compareDeductionRecords(before, after);
    expect(comparison.unchangedCount).toBe(2);
    expect(comparison.addedDevices).toHaveLength(0);
    expect(comparison.removedDevices).toHaveLength(0);
  });
});
