import { appendDeductionRecord, cloneScenario, compareDeductionRecords, createDeductionRecord, summarizeScenario, validateDevice, validateScenarioSettings } from './domain';
import { findScenario, type EnergyRepository } from './repository';
import type { DeductionRecord, EnergyDevice, EnergyDocument, EnergyScenario, Notice, RecordComparison, ViewStatus } from './types';

export interface EnergyLensState {
  document: EnergyDocument | null;
  status: ViewStatus;
  notice: Notice | null;
  selectedRecordIds: string[];
}

type Listener = (state: EnergyLensState) => void;

export class EnergyLensViewModel {
  private state: EnergyLensState = { document: null, status: 'loading', notice: null, selectedRecordIds: [] };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: EnergyRepository) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): EnergyLensState { return this.state; }

  initialize(): void {
    try {
      this.state = { ...this.state, document: this.repository.load(), status: 'ready', notice: null };
    } catch {
      this.state = { ...this.state, document: null, status: 'error', notice: { kind: 'error', text: '本地数据读取失败，请刷新重试' } };
    }
    this.emit();
  }

  get activeScenario(): EnergyScenario | null {
    if (!this.state.document) return null;
    return findScenario(this.state.document, this.state.document.activeScenarioId) ?? null;
  }

  get activeSummary() {
    return this.activeScenario ? summarizeScenario(this.activeScenario) : null;
  }

  updateDevice(deviceId: string, patch: Partial<Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device = scenario.devices.find((item) => item.id === deviceId);
    if (!device) return;
    const next = { ...device, ...patch };
    const error = validateDevice(next);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.map((item) => item.id === deviceId ? next : item) }), '参数已更新');
  }

  addDevice(): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device: EnergyDevice = { id: `device-${Date.now()}`, name: '新设备', watts: 100, dailyHours: 1 };
    this.commit((current) => ({ ...current, devices: [...current.devices, device] }), '已添加设备，可继续修改参数');
  }

  removeDevice(deviceId: string): void {
    const scenario = this.activeScenario;
    if (!scenario || scenario.devices.length <= 1) {
      this.setNotice({ kind: 'info', text: '至少保留一个设备，便于计算方案' });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.filter((item) => item.id !== deviceId) }), '设备已移除');
  }

  updateSettings(patch: Partial<Pick<EnergyScenario, 'name' | 'pricePerKwh' | 'daysPerMonth'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const next = { ...scenario, ...patch };
    const error = validateScenarioSettings(next.pricePerKwh, next.daysPerMonth);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, name: next.name.trim() || '未命名方案', pricePerKwh: next.pricePerKwh, daysPerMonth: next.daysPerMonth }), '计费参数已更新');
  }

  duplicateActive(): void {
    const source = this.activeScenario;
    if (!source || !this.state.document) return;
    const id = `scenario-${Date.now()}`;
    const copy = cloneScenario(source, id, `${source.name} · 副本`);
    const document = { ...this.state.document, scenarios: [...this.state.document.scenarios, copy], activeScenarioId: id };
    this.persist(document, '方案已复制，现在可以修改副本');
  }

  selectScenario(id: string): void {
    if (!this.state.document || !findScenario(this.state.document, id)) return;
    this.persist({ ...this.state.document, activeScenarioId: id }, '已切换方案');
  }

  complete(): void {
    const scenario = this.activeScenario;
    if (!scenario || !this.state.document) return;
    const record = createDeductionRecord(scenario);
    const records = appendDeductionRecord(this.state.document.records ?? [], record);
    const document: EnergyDocument = { ...this.state.document, records };
    try {
      this.repository.save(document);
      const keptIds = new Set(records.map((item) => item.id));
      this.state = {
        ...this.state,
        document,
        status: 'completed',
        notice: { kind: 'success', text: '本次推演已保存为记录，可在下方回看或对比' },
        selectedRecordIds: this.state.selectedRecordIds.filter((id) => keptIds.has(id)),
      };
    } catch {
      this.state = { ...this.state, status: 'error', notice: { kind: 'error', text: '保存失败，当前页面仍可继续编辑' } };
    }
    this.emit();
  }

  get records(): DeductionRecord[] {
    return (this.state.document?.records ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  toggleRecordSelection(id: string): void {
    const selected = this.state.selectedRecordIds;
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id].slice(-2);
    this.state = { ...this.state, selectedRecordIds: next };
    this.emit();
  }

  get recordComparison(): RecordComparison | null {
    if (this.state.selectedRecordIds.length !== 2) return null;
    const picked = this.records.filter((record) => this.state.selectedRecordIds.includes(record.id));
    if (picked.length !== 2) return null;
    const [base, target] = picked.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return compareDeductionRecords(base, target);
  }

  private commit(update: (scenario: EnergyScenario) => EnergyScenario, notice: string): void {
    if (!this.state.document) return;
    const document = { ...this.state.document, scenarios: this.state.document.scenarios.map((scenario) => scenario.id === this.state.document?.activeScenarioId ? update(scenario) : scenario) };
    this.persist(document, notice);
  }

  private persist(document: EnergyDocument, notice: string): void {
    try {
      this.repository.save(document);
      this.state = { ...this.state, document, status: 'editing', notice: { kind: 'success', text: notice } };
    } catch {
      this.state = { ...this.state, status: 'error', notice: { kind: 'error', text: '保存失败，当前页面仍可继续编辑' } };
    }
    this.emit();
  }

  private setNotice(notice: Notice): void {
    this.state = { ...this.state, status: notice.kind === 'error' ? 'error' : 'editing', notice };
    this.emit();
  }

  private emit(): void { this.listeners.forEach((listener) => listener(this.state)); }
}
