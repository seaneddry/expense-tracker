import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import {
  addPayment,
  deleteFriend,
  deleteLoanEntry,
  deleteLoanPayment,
  getFriendBalance,
  listLoanEntries,
  listLoanPayments,
} from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { allocate, netLabel, reminderLink } from '../lib/loans';
import type { ItemStatus } from '../lib/loans';
import { rm, shortDate, todayKL } from '../lib/format';
import type { LoanEntry, LoanPayment } from '../types';

type Pending =
  | { kind: 'settle' }
  | { kind: 'delete-friend' }
  | { kind: 'entry'; entry: LoanEntry }
  | { kind: 'payment'; payment: LoanPayment };

export function FriendDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();

  const friend = useQuery(() => getFriendBalance(id), [id]);
  const entries = useQuery(() => listLoanEntries(id), [id]);
  const payments = useQuery(() => listLoanPayments(id), [id]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const f = friend.data;
  const status = useMemo(() => allocate(entries.data ?? [], payments.data ?? []), [entries.data, payments.data]);
  const open = status.filter((s) => s.open > 0).sort((a, b) => b.entry.occurred_on.localeCompare(a.entry.occurred_on));

  // History: settled items and repayments, newest first.
  const history = useMemo(() => {
    const rows: ({ type: 'entry'; s: ItemStatus; date: string; at: string } | { type: 'payment'; p: LoanPayment; date: string; at: string })[] = [
      ...status.filter((s) => s.open === 0).map((s) => ({ type: 'entry' as const, s, date: s.entry.occurred_on, at: s.entry.created_at })),
      ...(payments.data ?? []).map((p) => ({ type: 'payment' as const, p, date: p.paid_on, at: p.created_at })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  }, [status, payments.data]);

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await fn();
      bump();
      toast(done);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link to="/friends" viewTransition className="nav-button">
      <Icon name="chevron-left" size={22} /> Friends
    </Link>
  );

  const error = friend.error ?? entries.error ?? payments.error;
  if (error || !f) {
    return (
      <Screen title="Friend" left={back}>
        <main className="page">
          {error ? <ErrorNotice message={error} onRetry={() => { friend.reload(); entries.reload(); payments.reload(); }} /> : null}
          {!error && friend.loading ? <Loading /> : null}
          {!error && !friend.loading && friend.data === null ? <ErrorNotice message="This friend no longer exists." /> : null}
        </main>
      </Screen>
    );
  }

  const net = f.net;
  const owesYou = net > 0.004;
  const youOwe = net < -0.004;
  const first = f.name.trim().split(/\s+/)[0];

  return (
    <Screen
      title={f.name}
      left={back}
      right={
        <Link to={`/friends/${id}/edit`} viewTransition className="nav-button nav-button-strong">
          Edit
        </Link>
      }
    >
      <main className="page stack">
        <section className="hero" aria-label="Balance">
          <div className="hero-label">{netLabel(first, net)}</div>
          <div className={`hero-amount num ${youOwe ? 'loan-owe' : ''}`}>{rm(Math.abs(net))}</div>
          <div className="hero-sub">
            {f.lent > 0 || f.borrowed > 0
              ? [
                  f.lent > 0 ? `You paid ${rm(f.lent)} for ${first}` : '',
                  f.borrowed > 0 ? `${first} paid ${rm(f.borrowed)} for you` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : `Nothing recorded with ${first} yet`}
          </div>
          {owesYou || youOwe ? (
            <div className="loan-actions">
              {owesYou ? (
                <a
                  className="button button-secondary"
                  href={reminderLink(f.name, f.phone, net, open)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="message" size={18} /> Remind
                </a>
              ) : null}
              <button className="button button-primary" disabled={busy} onClick={() => setPending({ kind: 'settle' })}>
                <Icon name="check" size={18} /> Settle up
              </button>
            </div>
          ) : null}
        </section>

        <div className="group">
          <div className="group-body">
            <Link to={`/friends/${id}/add/lent`} viewTransition className="row">
              <span className="row-icon loan-owed">
                <Icon name="arrow-up-right" size={18} />
              </span>
              <span className="row-label">I paid for {first}</span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to={`/friends/${id}/add/borrowed`} viewTransition className="row">
              <span className="row-icon loan-owe">
                <Icon name="arrow-down-left" size={18} />
              </span>
              <span className="row-label">{first} paid for me</span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to={`/friends/${id}/add/${youOwe ? 'paid' : 'received'}`} viewTransition className="row">
              <span className="row-icon">
                <Icon name="wallet" size={18} />
              </span>
              <span className="row-label">Record a repayment</span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </div>
          {!f.phone && owesYou ? (
            <div className="group-footer">Add {first}'s phone number (Edit) and Remind opens their WhatsApp chat directly.</div>
          ) : null}
        </div>

        {open.length > 0 ? (
          <section className="group">
            <div className="group-header">Open</div>
            <div className="group-body">
              {open.map((s) => (
                <EntryRow key={s.entry.id} s={s} name={first} onTap={() => setPending({ kind: 'entry', entry: s.entry })} />
              ))}
            </div>
          </section>
        ) : null}

        {history.length > 0 ? (
          <section className="group">
            <div className="group-header">History</div>
            <div className="group-body">
              {history.map((h) =>
                h.type === 'entry' ? (
                  <EntryRow key={h.s.entry.id} s={h.s} name={first} faded onTap={() => setPending({ kind: 'entry', entry: h.s.entry })} />
                ) : (
                  <button key={h.p.id} className="sub-row loan-row" onClick={() => setPending({ kind: 'payment', payment: h.p })}>
                    <span className="sub-initial" aria-hidden="true">
                      <Icon name="wallet" size={18} />
                    </span>
                    <span className="sub-main">
                      <span className="sub-title">
                        <span>{h.p.direction === 'received' ? `${first} paid you back` : `You paid ${first} back`}</span>
                      </span>
                      <span className="sub-sub">
                        {shortDate(h.p.paid_on)}
                        {h.p.note ? ` · ${h.p.note}` : ''}
                      </span>
                    </span>
                    <span className="sub-amount num">{rm(h.p.amount)}</span>
                  </button>
                ),
              )}
            </div>
            <div className="group-footer">Tap an item to delete it. Repayments clear the oldest items first.</div>
          </section>
        ) : null}

        <div className="group">
          <div className="group-body">
            <button className="row row-center row-danger" disabled={busy} onClick={() => setPending({ kind: 'delete-friend' })}>
              Delete {first}
            </button>
          </div>
        </div>
      </main>

      {pending?.kind === 'settle' ? (
        <ConfirmSheet
          title={
            owesYou
              ? `Record ${first} paying you ${rm(net)} today? Every open item is cleared.`
              : `Record you paying ${first} ${rm(-net)} today? Every open item is cleared.`
          }
          confirmLabel="Settle up"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(
              () => addPayment(id, owesYou ? 'received' : 'paid', Math.round(Math.abs(net) * 100) / 100, todayKL(), 'Settled up'),
              'Settled up',
            );
          }}
        />
      ) : null}
      {pending?.kind === 'entry' ? (
        <ConfirmSheet
          title={`Delete “${pending.entry.description}” (${rm(pending.entry.amount)})?${
            pending.entry.linked_expense_id ? ' Your own share stays in your expenses; delete it from History if needed.' : ''
          }`}
          confirmLabel="Delete item"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const e = pending.entry;
            setPending(null);
            void run(() => deleteLoanEntry(e.id), 'Deleted');
          }}
        />
      ) : null}
      {pending?.kind === 'payment' ? (
        <ConfirmSheet
          title={`Delete this ${rm(pending.payment.amount)} repayment from ${shortDate(pending.payment.paid_on)}?`}
          confirmLabel="Delete repayment"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const p = pending.payment;
            setPending(null);
            void run(() => deleteLoanPayment(p.id), 'Deleted');
          }}
        />
      ) : null}
      {pending?.kind === 'delete-friend' ? (
        <ConfirmSheet
          title={`Delete ${f.name} and all their IOUs and repayments? Expenses you logged stay in History. This can't be undone.`}
          confirmLabel={`Delete ${first}`}
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(async () => {
              await deleteFriend(id);
              navigate('/friends', { replace: true, viewTransition: true });
            }, 'Deleted');
          }}
        />
      ) : null}
    </Screen>
  );
}

function EntryRow({ s, name, faded, onTap }: { s: ItemStatus; name: string; faded?: boolean; onTap: () => void }) {
  const e = s.entry;
  const lent = e.direction === 'lent';
  const partly = s.covered > 0 && s.open > 0;
  return (
    <button className={`sub-row loan-row ${faded ? 'sub-row-faded' : ''}`} onClick={onTap}>
      <span className={`sub-initial ${lent ? 'loan-owed' : 'loan-owe'}`} aria-hidden="true">
        <Icon name={lent ? 'arrow-up-right' : 'arrow-down-left'} size={18} />
      </span>
      <span className="sub-main">
        <span className="sub-title">
          <span>{e.description}</span>
          {faded ? <span className="badge">Settled</span> : null}
        </span>
        <span className="sub-sub">
          {shortDate(e.occurred_on)} · {lent ? 'you paid' : `${name} paid`}
          {partly ? ` · ${rm(s.covered)} of ${rm(e.amount)} back` : ''}
        </span>
      </span>
      <span className={`sub-amount num ${faded ? '' : lent ? 'loan-owed' : 'loan-owe'}`}>
        {lent ? '+' : '−'}
        {rm(faded ? e.amount : s.open)}
      </span>
    </button>
  );
}
