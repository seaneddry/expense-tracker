import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { createRecurring, getRecurring, listRecurring, updateRecurring } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { CYCLE_LABEL, KIND_LABEL, parseAmount, todayKL } from '../lib/format';
import type { RecurringCycle, RecurringKind } from '../types';

const ALERT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '1 day', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

/** One screen for adding (/subscriptions/new) and editing (/subscriptions/:id/edit). */
export function SubscriptionForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();

  const existing = useQuery(() => (id ? getRecurring(id) : Promise.resolve(null)), [id]);
  const all = useQuery(listRecurring, []);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<RecurringKind>('subscription');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<RecurringCycle>('monthly');
  const [date, setDate] = useState(todayKL());
  const [trial, setTrial] = useState(false);
  const [alertDays, setAlertDays] = useState<number | null>(3);
  const [alertTouched, setAlertTouched] = useState(false);
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Card and PayLater items are due-date reminders: no fixed amount, no free trial.
  const isCredit = kind === 'credit';

  useEffect(() => {
    const e = existing.data;
    if (e && !loaded.current) {
      loaded.current = true;
      setName(e.name);
      setKind(e.kind);
      setAmount(e.amount === null ? '' : String(e.amount));
      setCycle(e.cycle);
      setDate(e.trial_ends_on ?? e.anchor_date);
      setTrial(Boolean(e.trial_ends_on));
      setAlertDays(e.alert_days);
      setAlertTouched(true);
      setCategory(e.category ?? '');
      setMethod(e.payment_method ?? '');
      setUrl(e.url ?? '');
      setNotes(e.notes ?? '');
    }
  }, [existing.data]);

  function pickKind(k: RecurringKind) {
    setKind(k);
    if (k === 'credit') setTrial(false);
    if (k === 'renewal' && cycle === 'monthly') setCycle('yearly');
    if (!alertTouched) setAlertDays(k === 'renewal' ? 30 : 3);
  }

  const categories = useMemo(
    () => [...new Set((all.data ?? []).map((i) => i.category).filter((c): c is string => Boolean(c)))],
    [all.data],
  );
  const methods = useMemo(
    () => [...new Set((all.data ?? []).map((i) => i.payment_method).filter((c): c is string => Boolean(c)))],
    [all.data],
  );

  const parsed = parseAmount(amount);
  const valid = name.trim() !== '' && (isCredit || (parsed !== null && parsed >= 0)) && date !== '';

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/subscriptions', { replace: true });
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const input = {
      name: name.trim(),
      kind,
      amount: isCredit ? null : parsed,
      cycle,
      anchor_date: date,
      trial_ends_on: trial && !isCredit ? date : null,
      alert_days: alertDays,
      category: category.trim() || null,
      payment_method: method.trim() || null,
      url: url.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (id) {
        await updateRecurring(id, input);
        bump();
        toast('Saved');
        navigate(`/subscriptions/${id}`, { replace: true, viewTransition: true });
      } else {
        await createRecurring(input);
        bump();
        toast(`Added ${input.name}`);
        navigate('/subscriptions', { replace: true, viewTransition: true });
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const waiting = editing && !existing.data && !existing.error;
  const ready = !editing || Boolean(existing.data);

  return (
    <Screen
      title={editing ? 'Edit subscription' : 'New subscription'}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={leave}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={() => void save()}>
          Save
        </button>
      }
    >
      <main className="page stack">
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}
        {editing && existing.data === null ? <ErrorNotice message="This item no longer exists." /> : null}
        {waiting ? <Loading /> : null}

        {ready ? (
          <>
            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Name</span>
                  <input
                    placeholder={isCredit ? 'e.g. Shopee PayLater' : 'e.g. Netflix'}
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {!isCredit ? (
                  <label className="row-input">
                    <span className="row-label">Amount</span>
                    <input inputMode="decimal" placeholder="RM 0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="group">
              <div className="group-header">Type</div>
              <div className="chips" role="group" aria-label="Type">
                {(Object.keys(KIND_LABEL) as RecurringKind[]).map((k) => (
                  <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => pickKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            <div className="group">
              <div className="group-header">{isCredit ? 'Due' : 'Charged'}</div>
              <div className="chips" role="group" aria-label="How often">
                {(Object.keys(CYCLE_LABEL) as RecurringCycle[]).map((c) => (
                  <button key={c} className={`chip ${cycle === c ? 'chip-on' : ''}`} onClick={() => setCycle(c)}>
                    {CYCLE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="group">
              <div className="group-body">
                {!isCredit ? (
                  <label className="row">
                    <span className="row-label">
                      Free trial
                      <span className="row-sub">The first real charge is when the trial ends</span>
                    </span>
                    <span className="switch">
                      <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} />
                      <span className="switch-track" />
                    </span>
                  </label>
                ) : null}
                <label className="row-input">
                  <span className="row-label">{isCredit ? 'Due on' : trial ? 'Trial ends' : 'Charged on'}</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">
                {isCredit
                  ? 'The next due date. The reminder moves forward by itself every cycle.'
                  : trial
                    ? 'You will be reminded to cancel before this date. Trial items are not counted in your monthly commitment yet.'
                    : 'Any date it was or will be charged. The next due date moves forward by itself every cycle.'}
              </div>
            </div>

            <div className="group">
              <div className="group-header">Alert before the date</div>
              <div className="chips" role="group" aria-label="Alert before the date">
                {ALERT_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    className={`chip ${alertDays === o.value ? 'chip-on' : ''}`}
                    onClick={() => {
                      setAlertDays(o.value);
                      setAlertTouched(true);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Category</span>
                  <input list="sub-categories" placeholder="e.g. Streaming" autoComplete="off" value={category} onChange={(e) => setCategory(e.target.value)} />
                </label>
                <datalist id="sub-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <label className="row-input">
                  <span className="row-label">Charged to</span>
                  <input list="sub-methods" placeholder="e.g. Maybank Visa" autoComplete="off" value={method} onChange={(e) => setMethod(e.target.value)} />
                </label>
                <datalist id="sub-methods">
                  {methods.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <label className="row-input">
                  <span className="row-label">Link</span>
                  <input type="url" inputMode="url" autoCapitalize="none" placeholder="Account or cancel page" value={url} onChange={(e) => setUrl(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Notes</span>
                  <input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={() => void save()}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add subscription'}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
