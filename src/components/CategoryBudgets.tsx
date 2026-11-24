import { useState } from 'react';
import { Icon } from './Icon';
import { pct, rmShort } from '../lib/format';
import type { CategoryView } from '../lib/homeCards';
import type { CategoryRow } from '../types';

/** A category counts as needing attention from this share of its budget. */
const ATTENTION_AT = 0.8;
/** Categories drawn with their own shade in the "One bar" view; the rest are grouped as Other. */
const BAR_TOP = 4;

interface Split {
  budgeted: (CategoryRow & { used: number })[]; // budget > 0, most used first
  unbudgeted: CategoryRow[]; // no budget but some spending
  spent: number;
  budget: number;
}

function split(rows: CategoryRow[]): Split {
  const budgeted = rows
    .filter((r) => r.budget > 0)
    .map((r) => ({ ...r, used: r.amount / r.budget }))
    .sort((a, b) => b.used - a.used || b.amount - a.amount);
  const unbudgeted = rows.filter((r) => r.budget <= 0 && r.amount > 0).sort((a, b) => b.amount - a.amount);
  return {
    budgeted,
    unbudgeted,
    spent: rows.reduce((s, r) => s + r.amount, 0),
    budget: budgeted.reduce((s, r) => s + r.budget, 0),
  };
}

/** "RM353 over" or "RM26 left". */
function leftText(r: CategoryRow): string {
  return r.amount > r.budget ? `${rmShort(r.amount - r.budget)} over` : `${rmShort(r.budget - r.amount)} left`;
}

function NoBudgetLine({ rows }: { rows: CategoryRow[] }) {
  if (rows.length === 0) return null;
  return <div className="cb-note">No budget: {rows.map((r) => `${r.name} ${rmShort(r.amount)}`).join(', ')}</div>;
}

/** Home's "By category" section, drawn in the view picked in Settings > Home layout. */
export function CategoryBudgets({ rows, view }: { rows: CategoryRow[]; view: CategoryView }) {
  const data = split(rows);
  if (data.budgeted.length === 0 && data.unbudgeted.length === 0) return null;
  return (
    <section className="group">
      <div className="group-header">By category</div>
      {view === 'rings' ? <Rings data={data} /> : view === 'allocation' ? <Allocation data={data} /> : <Attention data={data} />}
    </section>
  );
}

// ---------------------------------------------------------------- B: needs attention
function Attention({ data }: { data: Split }) {
  const [open, setOpen] = useState(false);
  const flagged = data.budgeted.filter((r) => r.used >= ATTENTION_AT);
  const onTrack = data.budgeted.length - flagged.length;

  return (
    <div className="group-body cb">
      <div className="cb-summary">
        <span>
          <strong className="num">{rmShort(data.spent)}</strong> of {rmShort(data.budget)}
        </span>
        <span className="num">{data.budget > 0 ? pct(data.spent / data.budget) : ''}</span>
      </div>

      {open ? (
        data.budgeted.map((r) => <CompactRow key={r.category_id} r={r} />)
      ) : flagged.length > 0 ? (
        flagged.map((r) => (
          <div className="cb-row" key={r.category_id}>
            <span className="cb-name">{r.name}</span>
            {r.amount > r.budget ? <span className="cb-pill num">{leftText(r)}</span> : <span className="cb-value num">{leftText(r)}</span>}
          </div>
        ))
      ) : (
        <div className="cb-row">
          <span className="cb-name cb-muted">Everything's on track</span>
        </div>
      )}

      {open ? <NoBudgetLine rows={data.unbudgeted} /> : null}

      {data.budgeted.length > flagged.length || data.unbudgeted.length > 0 || open ? (
        <button className="cb-row cb-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="cb-muted">
            {open ? 'Show less' : `${onTrack} on track${data.unbudgeted.length ? ` · ${data.unbudgeted.length} no budget` : ''}`}
          </span>
          <span className="cb-value">
            {open ? 'Less' : 'Show all'} <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

/** A's compact row: name and "RM453 / 100" on one line, thin bar under it. */
function CompactRow({ r }: { r: CategoryRow & { used: number } }) {
  const over = r.amount > r.budget;
  return (
    <div className="cb-compact">
      <div className="cb-compact-top">
        <span className="cb-name">{r.name}</span>
        <span className="cb-value num">
          <span className={over ? 'cb-over' : 'cb-strong'}>{rmShort(r.amount)}</span> / {Math.round(r.budget).toLocaleString('en-MY')}
        </span>
      </div>
      <div className="bar cb-bar" aria-hidden="true">
        <span className={over ? 'is-over' : ''} style={{ width: `${Math.min(r.used, 1) * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- C: rings
const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

function Rings({ data }: { data: Split }) {
  return (
    <>
      <div className="cb-rings">
        {data.budgeted.map((r) => {
          const over = r.amount > r.budget;
          return (
            <div className="cb-ring-tile" key={r.category_id}>
              <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r={RING_R} className="cb-ring-track" />
                {r.amount > 0 ? (
                  <circle
                    cx="20"
                    cy="20"
                    r={RING_R}
                    className={`cb-ring-fill ${over ? 'is-over' : ''}`}
                    strokeDasharray={`${Math.min(r.used, 1) * RING_C} ${RING_C}`}
                    transform="rotate(-90 20 20)"
                  />
                ) : null}
              </svg>
              <div className="cb-ring-text">
                <span className="cb-name">{r.name}</span>
                <span className={`cb-ring-sub num ${over ? 'cb-over' : ''}`}>{leftText(r)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <NoBudgetLine rows={data.unbudgeted} />
    </>
  );
}

// ---------------------------------------------------------------- D: one allocation bar
function Allocation({ data }: { data: Split }) {
  const bySpend = [...data.budgeted].sort((a, b) => b.amount - a.amount).filter((r) => r.amount > 0);
  const top = bySpend.slice(0, BAR_TOP);
  const otherAmount = bySpend.slice(BAR_TOP).reduce((s, r) => s + r.amount, 0);
  const budgetedSpent = bySpend.reduce((s, r) => s + r.amount, 0);
  const unused = Math.max(data.budget - budgetedSpent, 0);
  // When spending passes the budget, the bar is scaled to what was spent instead.
  const scale = Math.max(data.budget, budgetedSpent) || 1;
  const over = data.budgeted.filter((r) => r.amount > r.budget);

  const segments = [
    ...top.map((r, i) => ({ key: r.category_id, label: r.name, amount: r.amount, budget: r.budget, shade: i })),
    ...(otherAmount > 0 ? [{ key: 'other', label: 'Other', amount: otherAmount, budget: 0, shade: BAR_TOP }] : []),
  ];

  return (
    <div className="group-body cb">
      <div className="cb-alloc" role="img" aria-label={`${rmShort(budgetedSpent)} of ${rmShort(data.budget)} budget used`}>
        {segments.map((s) => (
          <span key={s.key} className={`cb-seg cb-shade-${s.shade}`} style={{ width: `${(s.amount / scale) * 100}%` }} />
        ))}
        {unused > 0 ? <span className="cb-seg cb-seg-unused" style={{ width: `${(unused / scale) * 100}%` }} /> : null}
      </div>
      {segments.map((s) => (
        <div className="cb-row cb-legend" key={s.key}>
          <span className="cb-name">
            <span className={`cb-dot cb-shade-${s.shade}`} aria-hidden="true" />
            {s.label}
          </span>
          <span className="cb-value num">
            {s.budget > 0 ? `${rmShort(s.amount)} / ${Math.round(s.budget).toLocaleString('en-MY')}` : rmShort(s.amount)}
          </span>
        </div>
      ))}
      <div className="cb-row cb-legend">
        <span className="cb-name">
          <span className="cb-dot cb-seg-unused" aria-hidden="true" />
          Unused
        </span>
        <span className="cb-value num">{rmShort(unused)} left</span>
      </div>
      {over.length > 0 ? (
        <div className="cb-note cb-over">Over budget: {over.map((r) => `${r.name} +${rmShort(r.amount - r.budget)}`).join(', ')}</div>
      ) : null}
      <NoBudgetLine rows={data.unbudgeted} />
    </div>
  );
}
