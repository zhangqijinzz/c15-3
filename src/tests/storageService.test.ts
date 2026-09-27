// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';
import type { EnergyDocument } from '../types';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to a valid example when saved JSON is damaged', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('opens a legacy document without records and keeps it usable', () => {
    const legacy: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
    localStorage.setItem('energy-lens.document.v1', JSON.stringify(legacy));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.records).toEqual([]);
  });

  it('round-trips deduction records and drops malformed ones', () => {
    const repository = new LocalEnergyRepository();
    const document = repository.load();
    const record = {
      id: 'record-1', scenarioId: exampleScenario.id, scenarioName: exampleScenario.name,
      createdAt: '2026-02-01T08:00:00.000Z', pricePerKwh: 0.62, daysPerMonth: 30,
      devices: [structuredClone(exampleScenario.devices[0])],
      total: { dailyKwh: 7.2, monthlyKwh: 216, monthlyCost: 133.92 },
    };
    repository.save({ ...document, records: [record, { id: 'broken' } as never] });
    const recovered = repository.load();
    expect(recovered.records).toHaveLength(1);
    expect(recovered.records?.[0]).toEqual(record);
  });
});
