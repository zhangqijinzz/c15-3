import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument, SimulationRecord } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; records: SimulationRecord[]; save: ReturnType<typeof vi.fn>; saveRecords: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  const records: SimulationRecord[] = [];
  return {
    data,
    records,
    load: () => data,
    save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }),
    loadRecords: vi.fn(() => records),
    saveRecords: vi.fn((next: readonly SimulationRecord[]) => { records.length = 0; records.push(...next); }),
  };
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

  it('creates no record before the first completion, then snapshots the current scenario', () => {
    expect(vm.getState().records).toHaveLength(0);
    expect(repository.saveRecords).not.toHaveBeenCalled();
    vm.complete();
    const state = vm.getState();
    expect(state.status).toBe('completed');
    expect(state.records).toHaveLength(1);
    expect(repository.saveRecords).toHaveBeenCalledTimes(1);
    const record = state.records[0];
    expect(record.scenarioId).toBe(exampleScenario.id);
    expect(record.scenarioName).toBe(exampleScenario.name);
    expect(record.pricePerKwh).toBe(exampleScenario.pricePerKwh);
    expect(record.daysPerMonth).toBe(exampleScenario.daysPerMonth);
    expect(record.deviceCount).toBe(exampleScenario.devices.length);
    expect(record.devices).toHaveLength(3);
    expect(record.result.monthlyKwh).toBeCloseTo(vm.activeSummary!.total.monthlyKwh);
  });

  it('keeps each completed snapshot independent of later edits', () => {
    vm.complete();
    const first = vm.getState().records[0];
    vm.updateDevice('device-aircon', { watts: 2000 });
    vm.complete();
    expect(vm.getState().records).toHaveLength(2);
    expect(vm.getState().records[0]).toEqual(first);
    expect(vm.getState().records[1].devices.find((device) => device.id === 'device-aircon')?.watts).toBe(2000);
  });

  it('recovers records on a fresh session and marks completion state unchanged', () => {
    vm.complete();
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().status).toBe('ready');
    expect(recovered.getState().records).toHaveLength(1);
  });

  it('reports an error but keeps the scenario usable when record persistence fails', () => {
    repository.saveRecords.mockImplementation(() => { throw new Error('quota'); });
    vm.complete();
    const state = vm.getState();
    expect(state.status).toBe('error');
    expect(state.records).toHaveLength(0);
    expect(state.notice?.text).toContain('记录保存失败');
    // 方案本体不受影响
    expect(vm.activeScenario?.devices).toHaveLength(3);
  });
});
