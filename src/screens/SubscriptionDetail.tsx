import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import {
  attachmentUrl,
  deleteAttachment,
  deleteRecurring,
  getRecurring,
  listAttachments,
  listPriceHistory,
  updateRecurring,
  uploadAttachment,
} from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { CYCLE_LABEL, CYCLE_UNIT, KIND_LABEL, inDays, longDate, rm, shortDate, todayKL } from '../lib/format';
import type { Attachment } from '../types';

const ALERT_CHOICES: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '1 day', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

function sizeLabel(bytes: number | null): string {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function SubscriptionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { session } = useAuth();

  const item = useQuery(() => getRecurring(id), [id]);
  const history = useQuery(() => listPriceHistory(id), [id]);
  const files = useQuery(() => listAttachments(id), [id]);

  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const it = item.data;

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await fn();
      bump();
      if (done) toast(done);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(att: Attachment) {
    const win = window.open('', '_blank');
    try {
      const url = await attachmentUrl(att.storage_path);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      toast(errorMessage(e));
    }
  }

  async function onPick(file: File | undefined) {
    if (!file || !session) return;
    await run(() => uploadAttachment(session.user.id, id, file), 'File added');
  }

  const back = (
    <Link to="/subscriptions" viewTransition className="nav-button">
      <Icon name="chevron-left" size={22} /> Subscriptions
    </Link>
  );

  if (item.error) {
    return (
      <Screen title="Subscription" left={back}>
        <main className="page">
          <ErrorNotice message={item.error} onRetry={item.reload} />
        </main>
      </Screen>
    );
  }
  if (!item.data && item.loading) {
    return (
      <Screen title="Subscription" left={back}>
        <main className="page">
          <Loading />
        </main>
      </Screen>
    );
  }
  if (!it) {
    return (
      <Screen title="Subscription" left={back}>
        <main className="page">
          <ErrorNotice message="This item no longer exists." />
        </main>
      </Screen>
    );
  }

  const linkOk = it.url ? /^https?:\/\//i.test(it.url) : false;

  return (
    <Screen
      title={it.name}
      sub={`${rm(it.amount)} ${CYCLE_UNIT[it.cycle]} · ${rm(it.yearly_cost)} a year`}
      left={back}
      right={
        <Link to={`/subscriptions/${id}/edit`} viewTransition className="nav-button nav-button-strong">
          Edit
        </Link>
      }
    >
      <main className="page stack">
        {it.in_trial && it.trial_ends_on ? (
          <div className="trial-banner" role="status">
            <strong>Free trial ends {inDays(it.days_until)}</strong>
            <span>
              Cancel before {shortDate(it.trial_ends_on)} to avoid the first {rm(it.amount)} charge.
            </span>
          </div>
        ) : null}

        <div className="group">
          <div className="group-header">Details</div>
          <div className="group-body">
            {it.status === 'active' && it.next_due ? (
              <div className="row">
                <span className="row-label">Next charge</span>
                <span className="row-value row-value-strong">
                  {shortDate(it.next_due)} · {inDays(it.days_until)}
                </span>
              </div>
            ) : (
              <div className="row">
                <span className="row-label">Status</span>
                <span className="row-value row-value-strong">
                  {it.status === 'paused' ? 'Paused' : 'Cancelled'}
                  {it.ends_on ? ` · ${longDate(it.ends_on)}` : ''}
                </span>
              </div>
            )}
            <div className="row">
              <span className="row-label">Type</span>
              <span className="row-value">
                {KIND_LABEL[it.kind]} · {CYCLE_LABEL[it.cycle]}
              </span>
            </div>
            {it.payment_method ? (
              <div className="row">
                <span className="row-label">Charged to</span>
                <span className="row-value">{it.payment_method}</span>
              </div>
            ) : null}
            {it.category ? (
              <div className="row">
                <span className="row-label">Category</span>
                <span className="row-value">{it.category}</span>
              </div>
            ) : null}
            <div className="row">
              <span className="row-label">Monthly equivalent</span>
              <span className="row-value num">{rm(it.monthly_cost)}</span>
            </div>
            {linkOk && it.url ? (
              <a className="row" href={it.url} target="_blank" rel="noopener noreferrer">
                <span className="row-label">Open account page</span>
                <Icon name="chevron-right" size={18} />
              </a>
            ) : null}
          </div>
          {it.notes ? <div className="group-footer">{it.notes}</div> : null}
        </div>

        <div className="group">
          <div className="group-header">Alert before the date</div>
          <div className="alert-chips" role="group" aria-label="Alert before the date">
            <Icon name="bell" size={20} />
            {ALERT_CHOICES.map((o) => (
              <button
                key={o.label}
                className={`chip ${it.alert_days === o.value ? 'chip-on' : ''}`}
                disabled={busy}
                onClick={() => void run(() => updateRecurring(id, { alert_days: o.value }))}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="group-footer">
            When a charge is this close, the item is flagged in the list and the Subscriptions tab shows a count.
          </div>
        </div>

        <div className="group">
          <div className="group-header">Price history</div>
          {(history.data ?? []).length === 0 ? (
            <div className="notice">No price changes yet. If you edit the amount, the change is recorded here.</div>
          ) : (
            <div className="group-body">
              {(history.data ?? []).map((h) => (
                <div className="row" key={h.id}>
                  <span className="row-label">
                    {longDate(h.changed_on)}
                    <span className="row-sub">{h.new_amount > h.old_amount ? 'Price went up' : 'Price went down'}</span>
                  </span>
                  <span className="row-value row-value-strong num">
                    {rm(h.old_amount)} → {rm(h.new_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="group">
          <div className="group-header">Attachments</div>
          <div className="group-body">
            {(files.data ?? []).map((f) => (
              <div className="row" key={f.id}>
                <button className="row-label" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => void openFile(f)}>
                  {f.file_name}
                  <span className="row-sub">{sizeLabel(f.size_bytes)}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${f.file_name}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteAttachment(f), 'File removed')}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            ))}
            <label className="row">
              <span className="row-icon">
                <Icon name="clip" size={18} />
              </span>
              <span className="row-label">Add receipt or contract</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  void onPick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="group-footer">Photos or PDFs up to 10 MB. Stored privately; only you can open them.</div>
        </div>

        <div className="group">
          <div className="group-body">
            {it.status === 'active' ? (
              <button className="row row-center" disabled={busy} onClick={() => void run(() => updateRecurring(id, { status: 'paused' }), 'Paused')}>
                Pause
              </button>
            ) : null}
            {it.status === 'paused' ? (
              <button className="row row-center" disabled={busy} onClick={() => void run(() => updateRecurring(id, { status: 'active' }), 'Resumed')}>
                Resume
              </button>
            ) : null}
            {it.status === 'cancelled' ? (
              <button
                className="row row-center"
                disabled={busy}
                onClick={() => void run(() => updateRecurring(id, { status: 'active', ends_on: null }), 'Reactivated')}
              >
                Reactivate
              </button>
            ) : (
              <button className="row row-center row-danger" disabled={busy} onClick={() => setConfirm('cancel')}>
                Mark as cancelled
              </button>
            )}
            <button className="row row-center row-danger" disabled={busy} onClick={() => setConfirm('delete')}>
              Delete
            </button>
          </div>
        </div>
      </main>

      {confirm === 'cancel' ? (
        <ConfirmSheet
          title={`Mark ${it.name} as cancelled? It stops appearing in upcoming charges.`}
          confirmLabel="Mark as cancelled"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void run(() => updateRecurring(id, { status: 'cancelled', ends_on: todayKL() }), 'Marked as cancelled');
          }}
        />
      ) : null}
      {confirm === 'delete' ? (
        <ConfirmSheet
          title="Delete this item, its price history and attachments? This can't be undone."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void run(async () => {
              await deleteRecurring(id);
              navigate('/subscriptions', { replace: true, viewTransition: true });
            }, 'Deleted');
          }}
        />
      ) : null}
    </Screen>
  );
}
