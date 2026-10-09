import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { createTransaction, deleteTransaction, getTransaction, listCategories, listSuggestions, updateTransaction } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { parseAmount, rm, todayKL } from '../lib/format';

/** One screen for adding (/add) and editing (/edit/:id) an expense. */
export function TransactionForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();

  const cats = useQuery(listCategories, []);
  const suggestions = useQuery(listSuggestions, []);
  const existing = useQuery(() => (id ? getTransaction(id) : Promise.resolve(null)), [id]);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayKL());
  const [categoryId, setCategoryId] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Fill the form once when editing.
  useEffect(() => {
    const t = existing.data;
    if (t && !loaded.current) {
      loaded.current = true;
      setAmount(String(t.amount));
      setDescription(t.description);
      setDate(t.occurred_on);
      setCategoryId(t.category_id);
      setCategoryTouched(true);
      setNeedsReview(t.needs_review);
    }
  }, [existing.data]);

  useEffect(() => {
    if (!editing) amountRef.current?.focus();
  }, [editing]);

  const byDescription = useMemo(
    () => new Map((suggestions.data ?? []).map((s) => [s.description.toLowerCase(), s])),
    [suggestions.data],
  );
  const match = byDescription.get(description.trim().toLowerCase());

  function onDescription(value: string) {
    setDescription(value);
    const hit = byDescription.get(value.trim().toLowerCase());
    if (hit && !categoryTouched) setCategoryId(hit.category_id);
  }

  const categories = (cats.data ?? []).filter((c) => c.is_active || c.id === categoryId);
  const parsed = parseAmount(amount);
  const valid = parsed !== null && parsed > 0 && description.trim() !== '' && categoryId !== '' && date !== '';

  function leave(fallback: string) {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback, { replace: true });
  }

  async function save() {
    if (!valid || parsed === null) return;
    setBusy(true);
    setError(null);
    const input = {
      occurred_on: date,
      description: description.trim(),
      category_id: categoryId,
      amount: parsed,
      needs_review: needsReview,
    };
    try {
      if (id) await updateTransaction(id, input);
      else await createTransaction(input);
      bump();
      const name = categories.find((c) => c.id === categoryId)?.name ?? '';
      toast(`${id ? 'Saved' : 'Added'} ${rm(parsed)} · ${name}`);
      navigate(id ? '/history' : '/', { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    setBusy(true);
    try {
      await deleteTransaction(id);
      bump();
      toast('Deleted');
      navigate('/history', { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const waiting = editing && !existing.data && !existing.error;
  // Adding has nothing to load; editing needs the existing row first.
  const ready = !editing || Boolean(existing.data);

  return (
    <Screen
      title={editing ? 'Edit expense' : 'New expense'}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => leave('/')}>
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
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}
        {editing && existing.data === null ? <ErrorNotice message="This expense no longer exists." /> : null}
        {waiting ? <Loading /> : null}

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

            {match && !amount ? (
              <div className="quick-amounts">
                <button className="chip" onClick={() => setAmount(String(match.last_amount))}>
                  Last time {rm(match.last_amount)}
                </button>
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">What</span>
                  <input
                    list="description-options"
                    placeholder="e.g. Nasi ayam"
                    autoComplete="off"
                    value={description}
                    onChange={(e) => onDescription(e.target.value)}
                  />
                </label>
                <datalist id="description-options">
                  {(suggestions.data ?? []).slice(0, 300).map((s) => (
                    <option key={s.description} value={s.description} />
                  ))}
                </datalist>
                <label className="row-input">
                  <span className="row-label">Date</span>
                  <input type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="group">
              <div className="group-header">Category</div>
              <div className="chips" role="group" aria-label="Category">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${categoryId === c.id ? 'chip-on' : ''}`}
                    onClick={() => {
                      setCategoryId(c.id);
                      setCategoryTouched(true);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="group">
              <div className="group-body">
                <label className="row">
                  <span className="row-label">
                    To check
                    <span className="row-sub">Flag it to review later</span>
                  </span>
                  <span className="switch">
                    <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
                    <span className="switch-track" />
                  </span>
                </label>
              </div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
              </button>
            </div>

            {editing ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete expense
              </button>
            ) : null}
          </>
        ) : null}
      </main>

      {confirmDelete ? (
        <ConfirmSheet
          title="Delete this expense? This can't be undone."
          confirmLabel="Delete expense"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </Screen>
  );
}
