import { formatNumber, formatRecordTime, MAX_DEDUCTION_RECORDS } from '../domain';
import type { DeductionRecord, RecordComparison } from '../types';

interface RecordHistoryProps {
  records: DeductionRecord[];
  selectedIds: string[];
  comparison: RecordComparison | null;
  onToggle: (id: string) => void;
}

function signed(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value))} ${unit}`;
}

export function RecordHistory({ records, selectedIds, comparison, onToggle }: RecordHistoryProps) {
  return <section className="record-section">
    <div className="section-title">
      <div><span className="step">05</span><h2>推演记录</h2><p>每次完成推演都会留下一份快照，可任选两条对比</p></div>
      <span className="retention-note">保留最近 {MAX_DEDUCTION_RECORDS} 条 · 超出后自动移除最早的记录</span>
    </div>

    {records.length === 0 && <div className="record-empty"><span>✎</span><p>还没有推演记录。调整好设备和计费参数后，点击「完成本次推演」即可留下第一份记录。</p></div>}

    {records.length > 0 && <div className="record-list">
      {records.map((record) => {
        const selected = selectedIds.includes(record.id);
        return <div className={`record-row ${selected ? 'selected' : ''}`} key={record.id}>
          <button className="record-check" aria-pressed={selected} onClick={() => onToggle(record.id)}>{selected ? '✓' : ''}</button>
          <div className="record-main">
            <strong>{record.scenarioName}</strong>
            <small>{formatRecordTime(record.createdAt)} · {record.devices.length} 台设备 · ¥{formatNumber(record.pricePerKwh)}/kWh · {record.daysPerMonth} 天</small>
          </div>
          <div className="record-figures">
            <b>{formatNumber(record.total.monthlyKwh)} kWh/月</b>
            <small>≈ ¥{formatNumber(record.total.monthlyCost)} · 日均 {formatNumber(record.total.dailyKwh)} kWh</small>
          </div>
        </div>;
      })}
    </div>}

    {comparison && <div className="record-compare">
      <div className="card-heading"><div><h3>记录对比</h3><p>{formatRecordTime(comparison.base.createdAt)} → {formatRecordTime(comparison.target.createdAt)}</p></div></div>
      <div className="compare-metrics">
        <div><span>月度用电</span><b className={comparison.deltaMonthlyKwh > 0 ? 'up' : comparison.deltaMonthlyKwh < 0 ? 'down' : ''}>{signed(comparison.deltaMonthlyKwh, 'kWh')}</b></div>
        <div><span>月度电费</span><b className={comparison.deltaMonthlyCost > 0 ? 'up' : comparison.deltaMonthlyCost < 0 ? 'down' : ''}>{signed(comparison.deltaMonthlyCost, '元')}</b></div>
        <div><span>日均用电</span><b className={comparison.deltaDailyKwh > 0 ? 'up' : comparison.deltaDailyKwh < 0 ? 'down' : ''}>{signed(comparison.deltaDailyKwh, 'kWh')}</b></div>
        <div><span>设备结构</span><b>+{comparison.addedDevices.length} / −{comparison.removedDevices.length} / 改 {comparison.changedDevices.length}</b></div>
      </div>
      {(comparison.addedDevices.length > 0 || comparison.removedDevices.length > 0 || comparison.changedDevices.length > 0)
        ? <ul className="compare-devices">
          {comparison.addedDevices.map((device) => <li key={`add-${device.id}`} className="added">新增「{device.name}」 {device.watts}W × {device.dailyHours}h</li>)}
          {comparison.removedDevices.map((device) => <li key={`remove-${device.id}`} className="removed">移除「{device.name}」 {device.watts}W × {device.dailyHours}h</li>)}
          {comparison.changedDevices.map(({ before, after }) => <li key={`change-${after.id}`} className="changed">「{after.name}」{before.watts}W × {before.dailyHours}h → {after.watts}W × {after.dailyHours}h</li>)}
        </ul>
        : <p className="compare-same">{comparison.deltaMonthlyKwh === 0 && comparison.deltaMonthlyCost === 0 ? '两次推演的设备结构与结果完全一致。' : '设备结构一致，差异来自电价或计费天数的变化。'}</p>}
    </div>}
  </section>;
}
