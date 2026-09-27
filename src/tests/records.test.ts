import { describe, expect, it } from 'vitest';
import { appendSimulationRecord, compareSimulationRecords, createSimulationRecord, formatRecordTime, MAX_RECORDS } from '../domain';
import type { EnergyScenario, SimulationRecord } from '../types';

function makeScenario(overrides: Partial<EnergyScenario> = {}): EnergyScenario {
  return {
    id: 's1',
    name: '测试方案',
    pricePerKwh: 0.6,
    daysPerMonth: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    devices: [
      { id: 'a', name: '空调', watts: 1000, dailyHours: 2 },
      { id: 'b', name: '冰箱', watts: 100, dailyHours: 24 },
    ],
    ...overrides,
  };
}

function makeRecord(day: number, overrides: Partial<SimulationRecord> = {}): SimulationRecord {
  const record = createSimulationRecord(makeScenario(), new Date(2026, 8, day, 10, 0));
  return { ...record, ...overrides, completedAt: new Date(2026, 8, day, 10, 0).toISOString() };
}

describe('simulation records', () => {
  it('snapshots devices, billing parameters and the usage conclusion', () => {
    const record = createSimulationRecord(makeScenario());
    expect(record.deviceCount).toBe(2);
    expect(record.devices.map((device) => device.name)).toEqual(['空调', '冰箱']);
    // 空调 2 度/日、冰箱 2.4 度/日，共 4.4 度/日
    expect(record.devices[0]).toMatchObject({ watts: 1000, dailyHours: 2, share: 2 / 4.4 });
    expect(record.result.dailyKwh).toBeCloseTo(4.4);
    expect(record.result.monthlyKwh).toBeCloseTo(132);
    expect(record.result.monthlyCost).toBeCloseTo(79.2);
    expect(Number.isNaN(Date.parse(record.completedAt))).toBe(false);
  });

  it(`keeps at most ${MAX_RECORDS} records and drops the earliest first`, () => {
    let records: SimulationRecord[] = [];
    for (let day = 1; day <= MAX_RECORDS + 3; day += 1) {
      records = appendSimulationRecord(records, makeRecord(day));
    }
    expect(records).toHaveLength(MAX_RECORDS);
    expect(new Date(records[0].completedAt).getDate()).toBe(4);
    expect(new Date(records[MAX_RECORDS - 1].completedAt).getDate()).toBe(MAX_RECORDS + 3);
  });

  it('stays sorted even when a record arrives out of order', () => {
    const later = makeRecord(5);
    const earlier = makeRecord(2);
    const records = appendSimulationRecord([later], earlier);
    expect(records.map((record) => new Date(record.completedAt).getDate())).toEqual([2, 5]);
  });

  it('compares two records by time and explains totals, kept, added and removed devices', () => {
    const before = createSimulationRecord(makeScenario(), new Date(2026, 8, 1));
    const after = createSimulationRecord(makeScenario({
      pricePerKwh: 0.8,
      devices: [
        { id: 'a', name: '空调', watts: 500, dailyHours: 2 },
        { id: 'c', name: '烘干机', watts: 2000, dailyHours: 1 },
      ],
    }), new Date(2026, 8, 10));

    const comparison = compareSimulationRecords(after, before);
    expect(comparison.earlier).toBe(before);
    expect(comparison.later).toBe(after);
    // 前：60 + 72 = 132；后：30 + 60 = 90
    expect(comparison.monthlyKwh.delta).toBeCloseTo(90 - 132);
    expect(comparison.pricePerKwh.delta).toBeCloseTo(0.2);
    expect(comparison.deviceCount.delta).toBe(0);

    const kept = comparison.deviceDeltas.find((item) => item.beforeName === '空调' && item.afterName === '空调');
    expect(kept?.beforeMonthlyKwh).toBeCloseTo(60);
    expect(kept?.afterMonthlyKwh).toBeCloseTo(30);
    expect(kept?.monthlyKwhDelta).toBeCloseTo(-30);
    const removed = comparison.deviceDeltas.find((item) => item.beforeName === '冰箱');
    expect(removed?.afterName).toBeNull();
    const added = comparison.deviceDeltas.find((item) => item.afterName === '烘干机');
    expect(added?.beforeName).toBeNull();
  });

  it('matches devices by name when ids differ (e.g. duplicated scenarios)', () => {
    const before = createSimulationRecord(makeScenario({ id: 's1' }), new Date(2026, 8, 1));
    const after = createSimulationRecord(makeScenario({
      id: 's2',
      devices: [{ id: 'new-a', name: '空调', watts: 800, dailyHours: 2 }, { id: 'new-b', name: '冰箱', watts: 100, dailyHours: 24 }],
    }), new Date(2026, 8, 2));
    const comparison = compareSimulationRecords(before, after);
    expect(comparison.deviceDeltas).toHaveLength(2);
    expect(comparison.deviceDeltas.every((item) => item.beforeName && item.afterName)).toBe(true);
    const aircon = comparison.deviceDeltas.find((item) => item.beforeName === '空调');
    expect(aircon?.monthlyKwhDelta).toBeCloseTo(48 - 60);
  });

  it('formats timestamps for review without breaking on invalid input', () => {
    expect(formatRecordTime('2026-09-27T14:30:00.000Z')).toMatch(/2026\/09\/2[78] \d{2}:30/);
    expect(formatRecordTime('not-a-date')).toBe('not-a-date');
  });
});
