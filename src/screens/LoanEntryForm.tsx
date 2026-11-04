import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import {
  addBorrowed,
  addLent,
  addPayment,
  deleteLoanEntry,
  deleteLoanPayment,
  getFriendBalance,
  getLoanEntry,
  getLoanPayment,
  listCategories,
  updateLoanEntry,
  updateLoanPayment,
} from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { parseAmount, rm, todayKL } from '../lib/format';

type Kind = 'lent' | 'borrowed' | 'received' | 'paid';
const KINDS: Kind[] = ['lent', 'borrowed', 'received', 'paid'];

/**
 * One form for everything you record with a friend:
 *   /friends/:id/add/:kind              add an item or repayment
 *   /friends/:id/item/:entryId          edit or delete an IOU item
 *   /friends/:id/repayment/:paymentId   edit or delete a repayment
 * Kinds:
 *   lent      I paid for them (IOU only, nothing goes into the expense log)
 *   borrowed  they paid for me (IOU, plus my share logged as an expense if the switch is on, new items only)
 *   received  they paid me back
 *   paid      I paid them back
 * Repayments never touch the expense log, so nothing is counted twice. Editing an item never
 * changes a linked expense in History either.
 */
export function LoanEntryForm() {
  const { id = '', kind: rawKind, entryId, paymentId } = useParams();
  const editing = Boolean(entryId || paymentId);
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();

  const friend = useQuery(() => getFriendBalance(id), [id]);
  const entry = useQuery(() => (entryId ? getLoanEntry(entryId) : Promise.resolve(null)), [entryId]);
  const payment = useQuery(() => (paymentId ? getLoanPayment(paymentId) : Promise.resolve(null)), [paymentId]);
  const cats = useQuery(listCategories, []);

  const kind: Kind = entry.data
    ? entry.data.direction
    : payment.data
      ? payment.data.direction
      : KINDS.includes(rawKind as Kind)
        ? (rawKind as Kind)
        : 'lent';

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayKL());
  const [note, setNote] = useState('');
  const [logExpense, setLogExpense] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Fill the form once when editing.
  useEffect(() => {
    if (loaded.current) return;
    if (entry.data) {
      loaded.current = true;
      setAmount(entry.data.amount.toFixed(2));
      setDescription(entry.data.description);
      setDate(entry.data.occurred_on);
      setNote(entry.data.note ?? '');
    } else if (payment.data) {
      loaded.current = true;
      setAmount(payment.data.amount.toFixed(2));
      setDate(payment.data.paid_on);
      setNote(payment.data.note ?? '');
    }
  }, [entry.data, payment.data]);

  useEffect(() => {
    if (!editing) amountRef.current?.focus();
  }, [editing]);

  const f = friend.data;
  const first = f ? f.name.trim().split(/\s+/)[0] : '';
  const isPayment = kind === 'received' || kind === 'paid';
  const parsed = parseAmount(amount);
  const needsCategory = !editing && kind === 'borrowed' && logExpense;
  const valid =
    parsed !== null &&
    parsed > 0 &&
    date !== '' &&
    (isPayment || description.trim() !== '') &&
    (!needsCategory || categoryId !== '');

  // What's outstanding in the direction of this repayment, for the "Full amount" chip (new repayments only).
  const outstanding = f && !editing ? (kind === 'received' ? f.net : kind === 'paid' ? -f.net : 0) : 0;

  const title = editing
    ? isPayment
      ? 'Edit repayment'
      : 'Edit item'
    : {
        lent: `I paid for ${first}`,
        borrowed: `${first} paid for me`,
        received: `${first} paid me back`,
        paid: `I paid ${first} back`,
      }[kind];

  const loadError = friend.error ?? entry.error ?? payment.error;
  const missing =
    (!friend.loading && friend.data === null) ||
    (entryId && !entry.loading && entry.data === null) ||
    (paymentId && !payment.loading && payment.data === null);
  const ready = Boolean(f) && (!entryId || Boolean(entry.data)) && (!paymentId || Boolean(payment.data));
  const linked = Boolean(entry.data?.linked_expense_id);

  function back() {
    navigate(`/friends/${id}`, { replace: true, viewTransition: true });
  }

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else back();
  }

  async function save() {
    if (!valid || parsed === null) return;
    setBusy(true);
    setError(null);
    try {
      if (entryId) {
        await updateLoanEntry(entryId, { description, occurred_on: date, amount: parsed, note: note || null });
      } else if (paymentId) {
        await updateLoanPayment(paymentId, { paid_on: date, amount: parsed, note: note || null });
      } else if (kind === 'lent') {
        await addLent(id, description, date, parsed, note || null);
      } else if (kind === 'borrowed') {
        await addBorrowed(id, description, date, parsed, needsCategory ? categoryId : null, note || null);
      } else {
        await addPayment(id, kind, parsed, date, note || null);
      }
      bump();
      toast(
        editing
          ? 'Saved'
          : kind === 'borrowed' && needsCategory
            ? `Added ${rm(parsed)} · also in your expenses`
            : `Added ${rm(parsed)}`,
      );
      back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      if (entryId) await deleteLoanEntry(entryId);
      if (paymentId) await deleteLoanPayment(paymentId);
      bump();
      toast('Deleted');
      back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const categories = (cats.data ?? []).filter((c) => c.is_active);

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
        {loadError ? (
          <ErrorNotice
            message={loadError}
            onRetry={() => {
              friend.reload();
              entry.reload();
              payment.reload();
            }}
          />
        ) : null}
        {!loadError && missing ? <ErrorNotice message="This item no longer exists." /> : null}
        {!loadError && !missing && !ready ? <Loading /> : null}

        {ready ? (
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
              {editing ? (
                <div className="group-header">
                  {
                    {
                      lent: `You paid for ${first}`,
                      borrowed: `${first} paid for you`,
                      received: `${first} paid you back`,
                      paid: `You paid ${first} back`,
                    }[kind]
                  }
                </div>
              ) : null}
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
              </div>
              <div className="group-footer">
                {kind === 'lent' ? `${first} owes you this amount. It is not added to your expenses.` : null}
                {kind === 'borrowed' ? `Enter your share only. You owe ${first} this amount.` : null}
                {isPayment ? 'Repayments only change the balance with this friend. They are never added to your expenses.' : null}
                {linked ? ' Changes here don’t change the linked expense in History; edit that there if needed.' : null}
              </div>
            </div>

            {!editing && kind === 'borrowed' ? (
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
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
              </button>
            </div>

            {editing ? (
              <div className="group">
                <div className="group-body">
                  <button className="row row-center row-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    {isPayment ? 'Delete repayment' : 'Delete item'}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      {confirmDelete ? (
        <ConfirmSheet
          title={
            isPayment
              ? `Delete this ${rm(payment.data?.amount ?? 0)} repayment?`
              : `Delete “${entry.data?.description ?? ''}” (${rm(entry.data?.amount ?? 0)})?${
                  linked ? ' The linked expense stays in History; delete it there if needed.' : ''
                }`
          }
          confirmLabel={isPayment ? 'Delete repayment' : 'Delete item'}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </Screen>
  );
}
