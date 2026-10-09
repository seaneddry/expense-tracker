import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { getCategoryBreakdown, getDailyTotals, getKpis } from '../api';
import { useQuery } from '../lib/useQuery';
import { addMonths, monthLabel, monthStart, pct, rm, rmShort, todayKL } from '../lib/format';
import type { CategoryRow, DayTotal, Kpis } from '../types';

export function Home() {
  const currentMonth = monthStart(todayKL());
  const [month, setMonth] = useState(currentMonth);

  const kpis = useQuery(() => getKpis(month), [month]);
  const cats = useQuery(() => getCategoryBreakdown(month), [month]);
  const days = useQuery(() => getDailyTotals(month), [month]);

  const switcher = (
    <div className="month-switch">
      <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
        <Icon name="chevron-left" size={20} />
      </button>
      <strong>{monthLabel(month)}</strong>
      <button aria-label="Next month" disabled={month >= currentMonth} onClick={() => setMonth(addMonths(month, 1))}>
        <Icon name="chevron-right" size={20} />
      </button>
    </div>
  );

  const k = kpis.data;
  const error = kpis.error ?? cats.error ?? days.error;

  return (
    <Screen title="Home" sub={switcher}>
      <main className="page stack">
        {error ? <ErrorNotice message={error} onRetry={() => { kpis.reload(); cats.reload(); days.reload(); }} /> : null}
        {!k && !error ? <Loading /> : null}

        {k && k.transaction_count === 0 ? (
          <Empty
            icon="receipt"
            title="Nothing logged yet"
            text={`No expenses in ${monthLabel(month)}. Add your first one, or import your old sheet from Settings.`}
            action={
              <Link to="/add" className="button button-primary">
                Add expense
              </Link>
            }
          />
        ) : null}

        {k && k.transaction_count > 0 ? (
          <>
            <Hero k={k} />
            <Tiles k={k} />
            {cats.data ? <Categories rows={cats.data} /> : null}
            {days.data ? <Heat days={days.data} month={month} /> : null}
          </>
        ) : null}
      </main>
    </Screen>
  );
}

function Hero({ k }: { k: Kpis }) {
  const diff = k.vs_last_month;
  const hasBudget = k.total_budget > 0;
  const filled = hasBudget ? Math.min(k.spent / k.total_budget, 1) * 100 : 0;
  const mark = hasBudget ? Math.min(k.expected_by_today / k.total_budget, 1) * 100 : 0;
  const over = hasBudget && k.spent > k.expected_by_today;

  return (
    <section className="hero" aria-label="Spent this month">
      <div className="hero-label">Spent this month</div>
      <div className="hero-amount num">{rm(k.spent)}</div>
      <div className="hero-sub">
        <span className={diff > 0 ? 'up' : 'down'}>{rm(Math.abs(diff))}</span> {diff > 0 ? 'more' : 'less'} than last month
      </div>
      {hasBudget ? (
        <>
          <div className="pace" role="img" aria-label={`Spent ${pct(k.spent / k.total_budget)} of the monthly budget`}>
            <div className={`pace-fill ${over ? 'is-over' : ''}`} style={{ width: `${filled}%` }} />
            <div className="pace-mark" style={{ left: `${mark}%` }} />
          </div>
          <div className="pace-caption">
            <span>Budget pace allows {rmShort(k.expected_by_today)} by today</span>
            <span>{rmShort(k.total_budget)} budget</span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Tile({ label, value, note, danger }: { label: string; value: string; note?: string; danger?: boolean }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value num ${danger ? 'is-danger' : ''}`}>{value}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </div>
  );
}

function Tiles({ k }: { k: Kpis }) {
  const projectedOver = k.total_budget > 0 && k.projected_month_end > k.total_budget;
  return (
    <div className="kpi-grid">
      <Tile label="Average per day" value={rm(k.avg_per_day)} note={`over ${k.days_elapsed} days`} />
      <Tile
        label="Projected month end"
        value={rm(k.projected_month_end)}
        note={k.total_budget > 0 ? `budget ${rmShort(k.total_budget)}` : undefined}
        danger={projectedOver}
      />
      <Tile label="Burn rate" value={pct(k.burn_rate)} note="spent vs budget pace" danger={k.burn_rate > 1} />
      <Tile label="Savings" value={rm(k.savings)} note={`${pct(k.savings_rate, 1)} of income`} danger={k.savings < 0} />
      <Tile label="Biggest category" value={k.biggest_category?.name ?? '-'} note={k.biggest_category ? rm(k.biggest_category.amount) : undefined} />
      <Tile
        label="Biggest transaction"
        value={rm(k.biggest_transaction?.amount ?? 0)}
        note={k.biggest_transaction ? `${k.biggest_transaction.description} · ${pct(k.biggest_transaction_pct)}` : undefined}
      />
      <Tile label="Weekdays" value={rm(k.weekday_total)} />
      <Tile label="Weekends" value={rm(k.weekend_total)} />
      <Tile label="Top 3 categories" value={pct(k.top3_pct, 1)} note="share of spending" />
      <Tile label="No-spend days" value={String(k.no_spend_days)} note={`of ${k.days_elapsed} days`} />
      <Tile label="Income cover" value={`${k.income_cover_months.toFixed(2)} months`} note="income ÷ 3-month average spend" />
      <Tile label="Transactions" value={String(k.transaction_count)} />
      <Tile label="This year" value={rmShort(k.year_spent)} />
      <Tile label="All time" value={rmShort(k.all_time_spent)} />
    </div>
  );
}

function Categories({ rows }: { rows: CategoryRow[] }) {
  const visible = rows.filter((r) => r.amount > 0 || r.budget > 0);
  if (visible.length === 0) return null;
  return (
    <section className="group">
      <div className="group-header">By category</div>
      <div className="group-body">
        {visible.map((r) => {
          const over = r.amount > r.budget;
          const width = r.budget > 0 ? Math.min(r.amount / r.budget, 1) * 100 : r.amount > 0 ? 100 : 0;
          return (
            <div className="cat-row" key={r.category_id}>
              <div className="cat-top">
                <span className="cat-name">{r.name}</span>
                <span className="cat-amount num">
                  <strong>{rm(r.amount)}</strong>
                  {r.budget > 0 || r.amount > 0 ? <> of {rmShort(r.budget)}</> : null}
                  {over && r.amount > 0 ? <span className="over"> · {rmShort(r.amount - r.budget)} over</span> : null}
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <span className={over && r.amount > 0 ? 'is-over' : ''} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Heat({ days, month }: { days: DayTotal[]; month: string }) {
  const today = todayKL();
  const max = days.reduce((m, d) => Math.max(m, d.amount), 0);
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first

  return (
    <section className="group">
      <div className="group-header">Day by day</div>
      <div className="heat">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div className="heat-dow" key={i}>
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div className="heat-cell is-empty" key={`e${i}`} />
        ))}
        {days.map((d) => {
          const future = d.day > today;
          const level = max > 0 ? d.amount / max : 0;
          const cls = ['heat-cell', future ? 'is-future' : '', !future && d.amount === 0 ? 'is-zero' : '', level > 0.5 ? 'is-hot' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={d.day}
              className={cls}
              style={{ '--level': level } as CSSProperties}
              title={`${d.day}: ${rm(d.amount)}`}
              aria-label={`${d.day}: ${rm(d.amount)}`}
            >
              {Number(d.day.slice(8))}
            </div>
          );
        })}
        <div className="heat-legend">
          <span>Green dot = no spend</span>
          <span>Darker = more spent</span>
        </div>
      </div>
    </section>
  );
}
