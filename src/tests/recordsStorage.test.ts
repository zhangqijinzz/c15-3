// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createSimulationRecord } from '../domain';
import { exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';
import { readRecords } from '../services/recordsStorage';

describe('records persistence and legacy compatibility', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips records through the repository, newest kept at the end', () => {
    const repository = new LocalEnergyRepository();
    const first = createSimulationRecord(exampleScenario, new Date(2026, 8, 1));
    const second = createSimulationRecord(exampleScenario, new Date(2026, 8, 5));
    repository.saveRecords([second, first].sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
    const loaded = repository.loadRecords();
    expect(loaded.map((record) => new Date(record.completedAt).getDate())).toEqual([1, 5]);
    expect(readRecords()).toHaveLength(2);
  });

  it('ignores damaged records data instead of failing the app', () => {
    localStorage.setItem('energy-lens.records.v1', '{not-json');
    expect(new LocalEnergyRepository().loadRecords()).toEqual([]);
    localStorage.setItem('energy-lens.records.v1', JSON.stringify([{ id: 'x' }]));
    expect(new LocalEnergyRepository().loadRecords()).toEqual([]);
  });

  it('loads legacy documents (without any records key) normally and starts with zero records', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({
      version: 1,
      scenarios: [exampleScenario],
      activeScenarioId: exampleScenario.id,
    }));
    const repository = new LocalEnergyRepository();
    const document = repository.load();
    expect(document.scenarios).toHaveLength(1);
    expect(document.activeScenarioId).toBe(exampleScenario.id);
    expect(repository.loadRecords()).toEqual([]);
  });
});
