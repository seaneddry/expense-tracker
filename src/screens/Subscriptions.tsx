import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { getRecurringCalendar, getRecurringSummary, listRecurring } from '../api';
import { useQuery } from '../lib/useQuery';
import {
  CYCLE_LABEL,
  addMonths,
  inDays,
  itemAmount,
  monthLabel,
  monthStart,
  rm,
  rmShort,
  shortDate,
  todayKL,
} from '../lib/format';
import type { RecurringDue, RecurringItem } from '../types';

type Tab = 'upcoming' | 'calendar' | 'all';

export function Subscriptions() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const items = useQuery(listRecurring, []);
  const summary = useQuery(getRecurringSummary, []);

  const list = items.data ?? [];
  const s = summary.data;

  const addButton = (
    <Link to="/subscriptions/new" viewTransition className="nav-icon-button" aria-label="Add subscription">
      <Icon name="plus" />
    </Link>
  );

  return (
    <Screen title="Subscriptions" sub={s ? `${rm(s.monthly_commitment)} a month committed` : undefined} right={addButton}>
      <main className="page stack">
        <div className="segmented" role="group" aria-label="View">
          {(['upcoming', 'calendar', 'all'] as Tab[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'upcoming' ? 'Upcoming' : t === 'calendar' ? 'Calendar' : 'All'}
            </button>
          ))}
        </div>

        {items.error ? <ErrorNotice message={items.error} onRetry={items.reload} /> : null}
        {!items.data && !items.error ? <Loading /> : null}

        {items.data && list.length === 0 ? (
          <Empty
            icon="repeat"
            title="No subscriptions yet"
            text="Track what you pay every month or year, and get an alert before each charge."
            action={
              <Link to="/subscriptions/new" className="button button-primary">
                Add one
              </Link>
            }
          />
        ) : null}

        {items.data && list.length > 0 ? (
          <>
            {tab === 'upcoming' ? <Upcoming items={list} /> : null}
            {tab === 'calendar' ? <CalendarView /> : null}
            {tab === 'all' ? <All items={list} /> : null}
          </>
        ) : null}
      </main>
    </Screen>
  );
}

function Row({ item }: { item: RecurringItem }) {
  const sub = item.in_trial && item.trial_ends_on
    ? `Free trial ends ${shortDate(item.trial_ends_on)}`
    : item.next_due
      ? `${CYCLE_LABEL[item.cycle]} · ${shortDate(item.next_due)}`
      : CYCLE_LABEL[item.cycle];

  return (
    <Link
      to={`/subscriptions/${item.id}`}
      viewTransition
      className={`sub-row ${item.status !== 'active' || item.paid ? 'sub-row-faded' : ''}`}
    >
      <span className="sub-initial" aria-hidden="true">
        {item.name.charAt(0).toUpperCase()}
      </span>
      <span className="sub-main">
        <span className="sub-title">
          <span>{item.name}</span>
          {item.in_trial ? <span className="badge badge-warn">Trial</span> : null}
          {item.kind === 'renewal' && !item.in_trial ? <span className="badge">Renewal</span> : null}
          {item.status === 'active' && item.paid ? <span className="badge">Paid</span> : null}
          {item.status !== 'active' ? <span className="badge">{item.status === 'paused' ? 'Paused' : 'Cancelled'}</span> : null}
        </span>
        <span className={`sub-sub ${item.alert_active ? 'is-alert' : ''}`}>
          {item.alert_active ? <Icon name="bell" size={13} /> : null}
          {sub}
        </span>
      </span>
      <span className="sub-amount num">
        {itemAmount(item.amount)}
        {item.status === 'active' && item.days_until !== null ? <small>{inDays(item.days_until)}</small> : null}
      </span>
    </Link>
  );
}

function Upcoming({ items }: { items: RecurringItem[] }) {
  const summary = useQuery(getRecurringSummary, []);
  const s = summary.data;

  const groups = useMemo(() => {
    const today = todayKL();
    const [y, m] = today.split('-').map(Number);
    const daysLeftInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate() - Number(today.slice(8));
    const out: { title: string; items: RecurringItem[] }[] = [
      { title: 'This week', items: [] },
      { title: 'Later this month', items: [] },
      { title: 'Later', items: [] },
    ];
    for (const i of items) {
      if (i.status !== 'active' || i.days_until === null) continue;
      if (i.days_until <= 7) out[0].items.push(i);
      else if (i.days_until <= daysLeftInMonth) out[1].items.push(i);
      else out[2].items.push(i);
    }
    return out.filter((g) => g.items.length > 0);
  }, [items]);

  return (
    <>
      {s ? (
        <section className="hero" aria-label="Monthly commitment">
          <div className="hero-label">Monthly commitment</div>
          <div className="hero-amount num">{rm(s.monthly_commitment)}</div>
          <div className="hero-sub">
            {rmShort(s.yearly_commitment)} a year · {s.active_count} active
            {s.trial_count > 0 ? ` · ${s.trial_count} free ${s.trial_count === 1 ? 'trial' : 'trials'} not counted yet` : ''}
          </div>
        </section>
      ) : null}

      {groups.length === 0 ? (
        <Empty icon="repeat" title="Nothing coming up" text="Paused and cancelled items are in the All tab." />
      ) : null}

      {groups.map((g) => (
        <section className="group" key={g.title}>
          <div className="group-header">{g.title}</div>
          <div className="group-body">
            {g.items.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function CalendarView() {
  const today = todayKL();
  const currentMonth = monthStart(today);
  const [month, setMonth] = useState(currentMonth);
  const [picked, setPicked] = useState<string | null>(null);
  const due = useQuery(() => getRecurringCalendar(month), [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, RecurringDue[]>();
    for (const d of due.data ?? []) map.set(d.day, [...(map.get(d.day) ?? []), d]);
    return map;
  }, [due.data]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const dayKey = (n: number) => `${month.slice(0, 7)}-${String(n).padStart(2, '0')}`;

  const firstDue = [...byDay.keys()].sort()[0];
  const selected = picked && picked.startsWith(month.slice(0, 7))
    ? picked
    : month === currentMonth
      ? today
      : firstDue ?? month;
  const selectedItems = byDay.get(selected) ?? [];

  function go(delta: number) {
    setMonth(addMonths(month, delta));
    setPicked(null);
  }

  return (
    <>
      <div className="month-switch" style={{ margin: '0 auto' }}>
        <button aria-label="Previous month" onClick={() => go(-1)}>
          <Icon name="chevron-left" size={20} />
        </button>
        <strong>{monthLabel(month)}</strong>
        <button aria-label="Next month" onClick={() => go(1)}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      <div className="cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div className="cal-dow" key={i}>
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div className="cal-day is-empty" key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = dayKey(i + 1);
          const items = byDay.get(key) ?? [];
          const cls = ['cal-day', key === today ? 'is-today' : '', key === selected ? 'is-selected' : ''].filter(Boolean).join(' ');
          return (
            <button
              key={key}
              className={cls}
              onClick={() => setPicked(key)}
              aria-label={`${shortDate(key)}${items.length ? `, ${items.length} due` : ''}`}
              aria-pressed={key === selected}
            >
              {i + 1}
              {items.length > 0 ? <i className={`cal-dot ${items.some((x) => x.is_trial_end) && key !== selected ? 'is-trial' : ''}`} /> : null}
            </button>
          );
        })}
      </div>

      {due.error ? <ErrorNotice message={due.error} onRetry={due.reload} /> : null}

      <section className="group">
        <div className="group-header">{shortDate(selected)}</div>
        {selectedItems.length === 0 ? (
          <div className="notice">Nothing due on this day.</div>
        ) : (
          <div className="group-body">
            {selectedItems.map((d) => (
              <Link key={`${d.item_id}-${d.day}`} to={`/subscriptions/${d.item_id}`} viewTransition className="sub-row">
                <span className="sub-initial" aria-hidden="true">
                  {d.name.charAt(0).toUpperCase()}
                </span>
                <span className="sub-main">
                  <span className="sub-title">
                    <span>{d.name}</span>
                    {d.is_trial_end ? <span className="badge badge-warn">Trial ends</span> : null}
                  </span>
                  <span className="sub-sub">{d.is_trial_end ? 'Cancel before this day to avoid the charge' : 'Charge due'}</span>
                </span>
                <span className="sub-amount num">{itemAmount(d.amount)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function All({ items }: { items: RecurringItem[] }) {
  const sections: { title: string; status: RecurringItem['status'] }[] = [
    { title: 'Active, by yearly cost', status: 'active' },
    { title: 'Paused', status: 'paused' },
    { title: 'Cancelled', status: 'cancelled' },
  ];

  return (
    <>
      {sections.map((sec) => {
        const rows = items.filter((i) => i.status === sec.status).sort((a, b) => b.yearly_cost - a.yearly_cost);
        if (rows.length === 0) return null;
        return (
          <section className="group" key={sec.status}>
            <div className="group-header">{sec.title}</div>
            <div className="group-body">
              {rows.map((i) => (
                <Link
                  key={i.id}
                  to={`/subscriptions/${i.id}`}
                  viewTransition
                  className={`sub-row ${i.status !== 'active' ? 'sub-row-faded' : ''}`}
                >
                  <span className="sub-initial" aria-hidden="true">
                    {i.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="sub-main">
                    <span className="sub-title">
                      <span>{i.name}</span>
                      {i.in_trial ? <span className="badge badge-warn">Trial</span> : null}
                    </span>
                    <span className="sub-sub">
                      {i.amount === null ? 'Reminder' : rm(i.amount)} {CYCLE_LABEL[i.cycle].toLowerCase()}
                      {i.category ? ` · ${i.category}` : ''}
                    </span>
                  </span>
                  {i.amount !== null ? (
                    <span className="sub-amount num">
                      {rmShort(i.yearly_cost)}
                      <small>a year</small>
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
