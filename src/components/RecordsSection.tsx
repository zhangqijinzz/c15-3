import { useMemo, useState } from 'react';
import { compareSimulationRecords, formatNumber, formatRecordTime, MAX_RECORDS, type RecordDeviceDelta, type SimulationRecordComparison } from '../domain';
import type { SimulationRecord } from '../types';

interface RecordsSectionProps {
  records: SimulationRecord[];
  defaultExpanded?: boolean;
}

const COMPARE_LIMIT = 2;

export function RecordsSection({ records, defaultExpanded = false }: RecordsSectionProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(() => (defaultExpanded ? records[0]?.id ?? null : null));

  const ordered = useMemo(() => records.slice().sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [records]);
  const selectedRecords = useMemo(
    () => selected.map((id) => records.find((record) => record.id === id)).filter((record): record is SimulationRecord => Boolean(record)),
    [selected, records],
  );
  const comparison = selectedRecords.length === COMPARE_LIMIT
    ? compareSimulationRecords(selectedRecords[0], selectedRecords[1])
    : null;

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length < COMPARE_LIMIT) return [...current, id];
      // 已选满两条时，最早选中的被新选择挤掉
      return [current[1], id];
    });
  };

  return <section className="records-section">
    <div className="section-title">
      <div><span className="step">05</span><h2>推演记录</h2><p>每次完成推演都会留存当时的设备、计费参数与用电结论</p></div>
      <span className="count-pill">{records.length} / {MAX_RECORDS} 份 · 超出自动丢弃最早</span>
    </div>

    {records.length === 0
      ? <div className="records-empty"><span>◷</span><p>还没有推演记录。<br />调整好设备与计费参数后，点击「完成本次推演」，这里就会留下第一份记录。</p></div>
      : <div className="records-list">
          {ordered.map((record) => {
            const selectIndex = selected.indexOf(record.id);
            const expanded = expandedId === record.id;
            return <div className={`record-card ${selectIndex >= 0 ? 'selected' : ''}`} key={record.id}>
              <div className="record-head" onClick={() => setExpandedId(expanded ? null : record.id)}>
                <span className="record-time">{formatRecordTime(record.completedAt)}</span>
                <span className="record-name">{record.scenarioName}</span>
                <span className="record-metrics"><b>{formatNumber(record.result.monthlyKwh)}</b> kWh / 月 · ¥{formatNumber(record.result.monthlyCost)} · {record.deviceCount} 台设备</span>
                <button
                  className={`record-pick ${selectIndex >= 0 ? 'active' : ''}`}
                  onClick={(event) => { event.stopPropagation(); toggleSelect(record.id); }}
                  aria-pressed={selectIndex >= 0}
                >{selectIndex >= 0 ? `对比 ${selectIndex + 1}` : '加入对比'}</button>
                <span className="record-expand">{expanded ? '收起' : '明细'} <i className={expanded ? 'up' : ''}>⌄</i></span>
              </div>
              {expanded && <RecordDetail record={record} />}
            </div>;
          })}
        </div>}

    {records.length > 0 && (
      selected.length === 0
        ? <p className="records-hint">勾选两条记录，即可并排对比电量、费用与设备结构的变化。</p>
        : <div className="compare-bar">已选择 {selected.length} / {COMPARE_LIMIT} 条{selected.length === COMPARE_LIMIT ? '' : '，再选一条开始对比'} <button className="link-button" onClick={() => setSelected([])}>清空选择</button></div>
    )}

    {comparison && <RecordComparison comparison={comparison} onClear={() => setSelected([])} />}
  </section>;
}

function RecordDetail({ record }: { record: SimulationRecord }) {
  return <div className="record-detail">
    <div className="record-params">
      <span><em>电价</em><b>¥{formatNumber(record.pricePerKwh)}</b> / kWh</span>
      <span><em>计费天数</em><b>{record.daysPerMonth}</b> 天 / 月</span>
      <span><em>日均用电</em><b>{formatNumber(record.result.dailyKwh)}</b> kWh</span>
      <span><em>月度用电</em><b>{formatNumber(record.result.monthlyKwh)}</b> kWh</span>
      <span><em>月度电费</em><b>¥{formatNumber(record.result.monthlyCost)}</b></span>
    </div>
    <div className="record-devices">
      <div className="record-device-row head"><span>设备</span><span>功率 W</span><span>每日 h</span><span>月度 kWh</span><span>占比</span><span>月度费用</span></div>
      {record.devices.map((device) => <div className="record-device-row" key={device.id}>
        <span>{device.name}</span><span>{formatNumber(device.watts, 0)}</span><span>{formatNumber(device.dailyHours, 1)}</span><span>{formatNumber(device.estimate.monthlyKwh)}</span><span>{Math.round(device.share * 100)}%</span><span>¥{formatNumber(device.estimate.monthlyCost)}</span>
      </div>)}
    </div>
  </div>;
}

function RecordComparison({ comparison, onClear }: { comparison: SimulationRecordComparison; onClear: () => void }) {
  const { earlier, later, deviceDeltas } = comparison;
  const sortedDeltas = deviceDeltas.slice().sort((a, b) => Math.abs(b.afterMonthlyKwh ?? b.beforeMonthlyKwh ?? 0) - Math.abs(a.afterMonthlyKwh ?? a.beforeMonthlyKwh ?? 0));
  const added = sortedDeltas.filter((item) => item.beforeName === null).length;
  const removed = sortedDeltas.filter((item) => item.afterName === null).length;
  const matched = sortedDeltas.length - added - removed;

  return <div className="compare-panel">
    <div className="compare-heading">
      <h3>两次推演对比</h3>
      <p>按完成时间自动确定先后，负值（绿）表示后一次更少，正值（橙）表示后一次更多</p>
      <button className="link-button" onClick={onClear}>清除对比</button>
    </div>
    <div className="compare-columns">
      <CompareColumn record={earlier} tag="较早" />
      <CompareColumn record={later} tag="较晚" />
    </div>
    <div className="compare-metrics">
      <CompareMetric label="月度用电" unit="kWh" delta={comparison.monthlyKwh} />
      <CompareMetric label="月度电费" unit="¥" delta={comparison.monthlyCost} prefix="¥" />
      <CompareMetric label="日均用电" unit="kWh" delta={comparison.dailyKwh} />
      <CompareMetric label="设备数量" unit="台" delta={comparison.deviceCount} digits={0} neutral />
      <CompareMetric label="电价" unit="元/kWh" delta={comparison.pricePerKwh} prefix="¥" neutral />
      <CompareMetric label="计费天数" unit="天" delta={comparison.daysPerMonth} digits={0} neutral />
    </div>
    <div className="compare-structure">
      <h4>设备结构变化</h4>
      <p>{matched} 台保留 · {added} 台新增 · {removed} 台移除</p>
      <div className="compare-device-list">
        {sortedDeltas.map((item) => <CompareDeviceRow key={item.key} item={item} />)}
      </div>
    </div>
  </div>;
}

function CompareColumn({ record, tag }: { record: SimulationRecord; tag: string }) {
  return <div className="compare-column">
    <span className="compare-tag">{tag}</span>
    <strong>{record.scenarioName}</strong>
    <small>{formatRecordTime(record.completedAt)} · {record.deviceCount} 台设备 · ¥{formatNumber(record.pricePerKwh)}/kWh × {record.daysPerMonth} 天</small>
    <div><b>{formatNumber(record.result.monthlyKwh)}</b> kWh / 月 <em>¥{formatNumber(record.result.monthlyCost)}</em></div>
  </div>;
}

function CompareMetric({ label, unit, delta, prefix = '', digits = 2, neutral = false }: { label: string; unit: string; delta: { before: number; after: number; delta: number }; prefix?: string; digits?: number; neutral?: boolean }) {
  const positive = delta.delta > 0;
  const negative = delta.delta < 0;
  const className = neutral ? 'neutral' : positive ? 'up' : negative ? 'down' : 'flat';
  const arrow = positive ? '↑' : negative ? '↓' : '·';
  return <div className={`compare-metric ${className}`}>
    <span>{label}</span>
    <div><b>{prefix}{formatNumber(delta.before, digits)}</b><i>→</i><b>{prefix}{formatNumber(delta.after, digits)}</b></div>
    <em>{arrow} {positive ? '+' : ''}{prefix}{formatNumber(delta.delta, digits)} {unit}</em>
  </div>;
}

function CompareDeviceRow({ item }: { item: RecordDeviceDelta }) {
  if (item.beforeName === null) {
    return <div className="compare-device-row added"><span className="device-status">新增</span><span className="device-title">{item.afterName}</span><span className="device-values">— <i>→</i> {formatNumber(item.afterMonthlyKwh ?? 0)} kWh</span></div>;
  }
  if (item.afterName === null) {
    return <div className="compare-device-row removed"><span className="device-status">移除</span><span className="device-title">{item.beforeName}</span><span className="device-values">{formatNumber(item.beforeMonthlyKwh ?? 0)} kWh <i>→</i> —</span></div>;
  }
  const change = item.monthlyKwhDelta ?? 0;
  return <div className={`compare-device-row ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>
    <span className="device-status">保留</span>
    <span className="device-title">{item.beforeName}{item.afterName !== item.beforeName ? ` → ${item.afterName}` : ''}</span>
    <span className="device-values">{formatNumber(item.beforeMonthlyKwh ?? 0)} <i>→</i> {formatNumber(item.afterMonthlyKwh ?? 0)} kWh <em>{change > 0 ? '+' : ''}{formatNumber(change)}</em></span>
  </div>;
}
