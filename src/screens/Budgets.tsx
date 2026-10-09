import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { getCategoryBreakdown, getIncome, upsertBudget, upsertIncome } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { monthLabel, monthStart, parseAmount, todayKL } from '../lib/format';

/** Budgets and income apply from the chosen month onward; earlier months keep their old values. */
export function Budgets() {
  const month = monthStart(todayKL());
  const { session } = useAuth();
  const toast = useToast();
  const bump = useBump();

  const rows = useQuery(() => getCategoryBreakdown(month), [month]);
  const income = useQuery(() => getIncome(month), [month]);

  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [incomeText, setIncomeText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rows.data) setBudgets(Object.fromEntries(rows.data.map((r) => [r.category_id, String(r.budget)])));
  }, [rows.data]);
  useEffect(() => {
    if (income.data !== undefined) setIncomeText(String(income.data));
  }, [income.data]);

  async function save() {
    if (!rows.data || !session) return;
    setBusy(true);
    try {
      for (const r of rows.data) {
        const n = parseAmount(budgets[r.category_id] ?? '');
        if (n !== null && n >= 0 && n !== r.budget) await upsertBudget(r.category_id, month, n);
      }
      const inc = parseAmount(incomeText);
      if (inc !== null && inc >= 0 && inc !== income.data) await upsertIncome(session.user.id, month, inc);
      bump();
      toast('Saved');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const error = rows.error ?? income.error;

  return (
    <Screen
      title="Budgets"
      sub={`From ${monthLabel(month)} onward`}
      left={
        <Link to="/settings" viewTransition className="nav-button">
          <Icon name="chevron-left" size={22} /> Settings
        </Link>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={busy || !rows.data} onClick={() => void save()}>
          Save
        </button>
      }
    >
      <main className="page stack">
        {error ? <ErrorNotice message={error} onRetry={() => { rows.reload(); income.reload(); }} /> : null}
        {!rows.data && !error ? <Loading /> : null}

        {rows.data ? (
          <>
            <div className="group">
              <div className="group-header">Monthly income</div>
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">RM</span>
                  <input inputMode="decimal" value={incomeText} onChange={(e) => setIncomeText(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="group">
              <div className="group-header">Monthly budget by category</div>
              <div className="group-body">
                {rows.data.map((r) => (
                  <label className="row-input" key={r.category_id}>
                    <span className="row-label" style={{ flex: '1 1 auto' }}>
                      {r.name}
                    </span>
                    <input
                      style={{ flex: '0 0 110px', textAlign: 'right' }}
                      inputMode="decimal"
                      aria-label={`${r.name} budget`}
                      value={budgets[r.category_id] ?? ''}
                      onChange={(e) => setBudgets({ ...budgets, [r.category_id]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <div className="group-footer">
                Changes apply from this month. Past months keep the budget they had, so your history stays accurate.
              </div>
            </div>

            <button className="button button-primary button-block" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
