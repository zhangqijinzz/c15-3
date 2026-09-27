import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario, MAX_DEDUCTION_RECORDS } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; data.records = next.records; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('creates a snapshot record on complete without disturbing the completed status', () => {
    expect(vm.records).toHaveLength(0);
    vm.updateDevice('device-aircon', { dailyHours: 4 });
    vm.complete();
    expect(vm.getState().status).toBe('completed');
    expect(vm.records).toHaveLength(1);
    const record = vm.records[0];
    expect(record.scenarioId).toBe(exampleScenario.id);
    expect(record.pricePerKwh).toBe(exampleScenario.pricePerKwh);
    expect(record.daysPerMonth).toBe(exampleScenario.daysPerMonth);
    expect(record.devices).toHaveLength(exampleScenario.devices.length);
    expect(record.total.monthlyKwh).toBeCloseTo(vm.activeSummary?.total.monthlyKwh ?? NaN);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps records as immutable snapshots of the moment of completion', () => {
    vm.complete();
    const recorded = vm.records[0].total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 1 });
    expect(vm.records[0].total.monthlyKwh).toBe(recorded);
    expect(vm.records).toHaveLength(1);
  });

  it('drops the oldest record once the retention limit is exceeded', () => {
    vi.useFakeTimers();
    try {
      const ids: string[] = [];
      for (let index = 0; index < MAX_DEDUCTION_RECORDS + 3; index += 1) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, index));
        vm.complete();
        ids.push(vm.records[0].id);
      }
      expect(vm.records).toHaveLength(MAX_DEDUCTION_RECORDS);
      const kept = vm.records.map((record) => record.id);
      expect(kept).not.toContain(ids[0]);
      expect(kept).not.toContain(ids[2]);
      expect(kept).toContain(ids[3]);
      expect(kept).toContain(ids[ids.length - 1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('compares two selected records, oldest as the baseline', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0));
      vm.complete();
      vi.setSystemTime(new Date(2026, 0, 1, 10, 0));
      vm.updateDevice('device-aircon', { dailyHours: 2 });
      vm.complete();
      const [newest, oldest] = vm.records;
      vm.toggleRecordSelection(newest.id);
      vm.toggleRecordSelection(oldest.id);
      const comparison = vm.recordComparison;
      expect(comparison?.base.id).toBe(oldest.id);
      expect(comparison?.target.id).toBe(newest.id);
      expect(comparison?.deltaMonthlyKwh).toBeLessThan(0);
      expect(comparison?.changedDevices.map((entry) => entry.after.id)).toContain('device-aircon');
      vm.toggleRecordSelection(oldest.id);
      expect(vm.recordComparison).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps at most two records selected, replacing the oldest pick', () => {
    vi.useFakeTimers();
    try {
      for (let index = 0; index < 3; index += 1) {
        vi.setSystemTime(new Date(2026, 0, 1, 8, index));
        vm.complete();
      }
      const [a, b, c] = vm.records;
      vm.toggleRecordSelection(a.id);
      vm.toggleRecordSelection(b.id);
      vm.toggleRecordSelection(c.id);
      expect(vm.getState().selectedRecordIds).toEqual([b.id, c.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});
