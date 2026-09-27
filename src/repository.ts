import { exampleScenario } from './domain';
import { readDocument, writeDocument } from './services/storageService';
import { readRecords, writeRecords } from './services/recordsStorage';
import type { EnergyDocument, EnergyScenario, SimulationRecord } from './types';

export interface EnergyRepository {
  load(): EnergyDocument;
  save(document: EnergyDocument): void;
  loadRecords(): SimulationRecord[];
  saveRecords(records: readonly SimulationRecord[]): void;
}

export class LocalEnergyRepository implements EnergyRepository {
  load(): EnergyDocument {
    const saved = readDocument();
    if (!saved || saved.scenarios.length === 0) {
      return { version: 1, scenarios: [exampleScenario], activeScenarioId: exampleScenario.id };
    }
    const activeExists = saved.scenarios.some((scenario) => scenario.id === saved.activeScenarioId);
    return activeExists ? saved : { ...saved, activeScenarioId: saved.scenarios[0].id };
  }

  save(document: EnergyDocument): void {
    writeDocument(document);
  }

  loadRecords(): SimulationRecord[] {
    return readRecords();
  }

  saveRecords(records: readonly SimulationRecord[]): void {
    writeRecords(records);
  }
}

export function findScenario(document: EnergyDocument, id: string): EnergyScenario | undefined {
  return document.scenarios.find((scenario) => scenario.id === id);
}
