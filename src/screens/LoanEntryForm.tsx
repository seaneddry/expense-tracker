import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addBorrowed, addLent, addPayment, getFriendBalance, listCategories, sortCategories } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { parseAmount, rm, todayKL } from '../lib/format';

type Kind = 'lent' | 'borrowed' | 'received' | 'paid';
const KINDS: Kind[] = ['lent', 'borrowed', 'received', 'paid'];

/**
 * One form for everything you record with a friend (/friends/:id/add/:kind):
 *   lent      I paid for them (IOU only, nothing goes into the expense log)
 *   borrowed  they paid for me (IOU, plus my share logged as an expense if the switch is on)
 *   received  they paid me back
 *   paid      I paid them back
 * Repayments never touch the expense log, so nothing is counted twice.
 */
export function LoanEntryForm() {
  const { id = '', kind: rawKind } = useParams();
  const kind: Kind = KINDS.includes(rawKind as Kind) ? (rawKind as Kind) : 'lent';
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();

  const friend = useQuery(() => getFriendBalance(id), [id]);
  const cats = useQuery(listCategories, []);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayKL());
  const [note, setNote] = useState('');
  const [logExpense, setLogExpense] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const f = friend.data;
  const first = f ? f.name.trim().split(/\s+/)[0] : '';
  const isPayment = kind === 'received' || kind === 'paid';
  const parsed = parseAmount(amount);
  const needsCategory = kind === 'borrowed' && logExpense;
  const valid =
    parsed !== null &&
    parsed > 0 &&
    date !== '' &&
    (isPayment || description.trim() !== '') &&
    (!needsCategory || categoryId !== '');

  // What's outstanding in the direction of this repayment, for the "Full amount" chip.
  const outstanding = f ? (kind === 'received' ? f.net : kind === 'paid' ? -f.net : 0) : 0;

  const title = {
    lent: `I paid for ${first}`,
    borrowed: `${first} paid for me`,
    received: `${first} paid me back`,
    paid: `I paid ${first} back`,
  }[kind];

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate(`/friends/${id}`, { replace: true });
  }

  async function save() {
    if (!valid || parsed === null) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'lent') await addLent(id, description, date, parsed);
      else if (kind === 'borrowed') await addBorrowed(id, description, date, parsed, needsCategory ? categoryId : null);
      else await addPayment(id, kind, parsed, date, note || null);
      bump();
      toast(
        kind === 'borrowed' && needsCategory
          ? `Added ${rm(parsed)} · also in your expenses`
          : `Added ${rm(parsed)}`,
      );
      navigate(`/friends/${id}`, { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const categories = sortCategories((cats.data ?? []).filter((c) => c.is_active));

  return (
    <Screen
      title={f ? title : 'Friend'}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={leave}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={save}>
          Save
        </button>
      }
    >
      <main className="page stack">
        {friend.error ? <ErrorNotice message={friend.error} onRetry={friend.reload} /> : null}
        {!f && !friend.error ? (friend.loading ? <Loading /> : <ErrorNotice message="This friend no longer exists." />) : null}

        {f ? (
          <>
            <div className="amount-field">
              <span className="currency">RM</span>
              <input
                ref={amountRef}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount in ringgit"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {isPayment && outstanding > 0.004 && !amount ? (
              <div className="quick-amounts">
                <button className="chip" onClick={() => setAmount(outstanding.toFixed(2))}>
                  Full amount {rm(outstanding)}
                </button>
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                {!isPayment ? (
                  <label className="row-input">
                    <span className="row-label">What</span>
                    <input
                      maxLength={120}
                      placeholder={kind === 'lent' ? 'e.g. Movie tickets' : 'e.g. Taxi ride'}
                      autoComplete="off"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="row-input">
                  <span className="row-label">Date</span>
                  <input type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
                </label>
                {isPayment ? (
                  <label className="row-input">
                    <span className="row-label">Note</span>
                    <input
                      maxLength={120}
                      placeholder="Optional"
                      autoComplete="off"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <div className="group-footer">
                {kind === 'lent' ? `${first} owes you this amount. It is not added to your expenses.` : null}
                {kind === 'borrowed' ? `Enter your share only. You owe ${first} this amount.` : null}
                {isPayment ? 'Repayments only change the balance with this friend. They are never added to your expenses.' : null}
              </div>
            </div>

            {kind === 'borrowed' ? (
              <>
                <div className="group">
                  <div className="group-body">
                    <label className="row">
                      <span className="row-label">
                        Also log as my expense
                        <span className="row-sub">You spent it, just through {first}</span>
                      </span>
                      <span className="switch">
                        <input type="checkbox" checked={logExpense} onChange={(e) => setLogExpense(e.target.checked)} />
                        <span className="switch-track" />
                      </span>
                    </label>
                  </div>
                </div>
                {logExpense ? (
                  <div className="group">
                    <div className="group-header">Category</div>
                    <div className="chips" role="group" aria-label="Category">
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          className={`chip ${categoryId === c.id ? 'chip-on' : ''}`}
                          onClick={() => setCategoryId(c.id)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
