import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import {
  createFriend,
  createTransaction,
  deleteTransaction,
  getTransaction,
  listCategories,
  listFriendBalances,
  listSuggestions,
  splitExpense,
  updateTransaction,
} from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { parseAmount, rm, todayKL } from '../lib/format';

const REMARKS_MAX = 500;

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
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Split with friends (new expenses only). The amount above is then the whole bill.
  const friends = useQuery(() => (editing ? Promise.resolve([]) : listFriendBalances()), [editing]);
  const [split, setSplit] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [includeMe, setIncludeMe] = useState(true);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [newFriend, setNewFriend] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

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
      setRemarks(t.remarks ?? '');
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
  const shares = useMemo(
    () => (split ? splitShares(parsed ?? 0, picked, splitMode, includeMe, custom) : null),
    [split, parsed, picked, splitMode, includeMe, custom],
  );
  const splitOk = !shares || (picked.length > 0 && shares.mine >= 0 && shares.friends.every((x) => x.amount > 0));
  const valid = parsed !== null && parsed > 0 && description.trim() !== '' && categoryId !== '' && date !== '' && splitOk;

  function togglePick(fid: string) {
    setPicked((p) => (p.includes(fid) ? p.filter((x) => x !== fid) : [...p, fid]));
  }

  async function addFriendInline() {
    const name = newFriend.trim();
    if (!name) return;
    setAddingFriend(true);
    try {
      const fid = await createFriend(name, null);
      setNewFriend('');
      setPicked((p) => [...p, fid]);
      friends.reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setAddingFriend(false);
    }
  }

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
      remarks: remarks.trim() || null,
    };
    try {
      const name = categories.find((c) => c.id === categoryId)?.name ?? '';
      if (!id && shares) {
        await splitExpense(input, shares.mine, shares.friends);
        bump();
        const owed = shares.friends.reduce((a, x) => a + x.amount, 0);
        toast(shares.mine > 0 ? `Added ${rm(shares.mine)} · ${name} · ${rm(owed)} to IOUs` : `${rm(owed)} added to IOUs`);
        navigate('/', { replace: true, viewTransition: true });
        return;
      }
      if (id) await updateTransaction(id, input);
      else await createTransaction(input);
      bump();
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
                    placeholder="e.g. Lunch"
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
                <label className="row-input row-input-multiline">
                  <span className="row-label">Remarks</span>
                  <textarea
                    rows={2}
                    maxLength={REMARKS_MAX}
                    placeholder="Optional"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
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

            {!editing ? (
              <div className="group">
                <div className="group-body">
                  <label className="row">
                    <span className="row-label">
                      Split with friends
                      <span className="row-sub">Your share is logged, the rest goes to IOUs</span>
                    </span>
                    <span className="switch">
                      <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                      <span className="switch-track" />
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            {!editing && split ? (
              <div className="group">
                <div className="group-header">Who was it for?</div>
                <div className="chips" role="group" aria-label="Friends">
                  {(friends.data ?? []).map((f) => (
                    <button key={f.id} className={`chip ${picked.includes(f.id) ? 'chip-on' : ''}`} onClick={() => togglePick(f.id)}>
                      {f.name}
                    </button>
                  ))}
                </div>
                <div className="group-body">
                  <div className="row-input split-new">
                    <input
                      placeholder="Add a new friend"
                      maxLength={60}
                      autoComplete="off"
                      value={newFriend}
                      onChange={(e) => setNewFriend(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addFriendInline();
                        }
                      }}
                    />
                    <button className="button button-secondary button-small" disabled={!newFriend.trim() || addingFriend} onClick={() => void addFriendInline()}>
                      Add
                    </button>
                  </div>
                </div>

                {picked.length > 0 ? (
                  <>
                    <div className="segmented segmented-2" role="group" aria-label="How to split">
                      <button aria-pressed={splitMode === 'equal'} onClick={() => setSplitMode('equal')}>
                        Split equally
                      </button>
                      <button aria-pressed={splitMode === 'custom'} onClick={() => setSplitMode('custom')}>
                        Custom amounts
                      </button>
                    </div>
                    <div className="group-body">
                      {splitMode === 'equal' ? (
                        <label className="row">
                          <span className="row-label">
                            Include me
                            <span className="row-sub">Off if you only paid for them</span>
                          </span>
                          <span className="switch">
                            <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
                            <span className="switch-track" />
                          </span>
                        </label>
                      ) : null}
                      {picked.map((fid) => {
                        const f = (friends.data ?? []).find((x) => x.id === fid);
                        const share = shares?.friends.find((x) => x.friend_id === fid)?.amount ?? 0;
                        return splitMode === 'custom' ? (
                          <label className="row-input" key={fid}>
                            <span className="row-label">{f?.name ?? 'Friend'}</span>
                            <input
                              inputMode="decimal"
                              placeholder="0.00"
                              aria-label={`${f?.name ?? 'Friend'}'s share`}
                              value={custom[fid] ?? ''}
                              onChange={(e) => setCustom((c) => ({ ...c, [fid]: e.target.value }))}
                            />
                          </label>
                        ) : (
                          <div className="row" key={fid}>
                            <span className="row-label">{f?.name ?? 'Friend'}</span>
                            <span className="row-value num">{rm(share)}</span>
                          </div>
                        );
                      })}
                      <div className="row">
                        <span className="row-label">
                          <strong>Your share</strong>
                          <span className="row-sub">Goes into your expenses</span>
                        </span>
                        <span className={`row-value row-value-strong num ${shares && shares.mine < 0 ? 'loan-owe' : ''}`}>
                          {rm(shares?.mine ?? 0)}
                        </span>
                      </div>
                    </div>
                    <div className="group-footer">
                      {shares && shares.mine < 0
                        ? 'Friends’ shares add up to more than the bill.'
                        : `Total bill ${rm(parsed ?? 0)}. ${rm((parsed ?? 0) - (shares?.mine ?? 0))} is added to IOUs.`}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

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
                {busy ? 'Saving…' : editing ? 'Save changes' : split ? 'Add and split' : 'Add expense'}
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

/**
 * Works out each person's share in whole sen. Equal splits give any leftover sen to you
 * (or to the first friend when you're not included), so shares always add up to the bill.
 */
function splitShares(
  total: number,
  picked: string[],
  mode: 'equal' | 'custom',
  includeMe: boolean,
  custom: Record<string, string>,
): { mine: number; friends: { friend_id: string; amount: number }[] } {
  const totalSen = Math.round(total * 100);
  if (picked.length === 0) return { mine: total, friends: [] };
  if (mode === 'custom') {
    const friends = picked.map((fid) => ({ friend_id: fid, amount: parseAmount(custom[fid] ?? '') ?? 0 }));
    const used = friends.reduce((a, x) => a + Math.round(x.amount * 100), 0);
    return { mine: (totalSen - used) / 100, friends };
  }
  const people = picked.length + (includeMe ? 1 : 0);
  const each = Math.floor(totalSen / people);
  const leftover = totalSen - each * people;
  const friends = picked.map((fid, i) => ({
    friend_id: fid,
    amount: (each + (!includeMe && i === 0 ? leftover : 0)) / 100,
  }));
  return { mine: includeMe ? (each + leftover) / 100 : 0, friends };
}
