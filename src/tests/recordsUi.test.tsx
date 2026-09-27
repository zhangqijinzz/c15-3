// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSimulationRecord } from '../domain';
import { exampleScenario } from '../domain';
import { RecordsSection } from '../components/RecordsSection';

describe('RecordsSection smoke', () => {
  it('shows empty guidance before any record', () => {
    const html = renderToStaticMarkup(<RecordsSection records={[]} />);
    expect(html).toContain('还没有推演记录');
    expect(html).not.toContain('record-card');
  });

  it('lists records newest-first with their conclusions', () => {
    const first = createSimulationRecord(exampleScenario, new Date(2026, 8, 1, 9, 0));
    const second = createSimulationRecord(exampleScenario, new Date(2026, 8, 20, 9, 0));
    const html = renderToStaticMarkup(<RecordsSection records={[first, second]} />);
    expect(html).toContain('2 / 20 份');
    expect(html.indexOf('2026/09/20')).toBeLessThan(html.indexOf('2026/09/01'));
    expect(html).toContain('加入对比');
    expect(html).toContain('勾选两条记录');
    expect(html).toContain(exampleScenario.name);
  });

  it('exposes billing parameters and per-device detail when expanded', () => {
    const record = createSimulationRecord(exampleScenario);
    const html = renderToStaticMarkup(<RecordsSection records={[record]} defaultExpanded />);
    expect(html).toContain('客厅空调');
    expect(html).toContain('冰箱');
    expect(html).toContain('月度费用');
  });
});
