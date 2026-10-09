import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { countNeedsReview, exportAllTransactions } from '../api';
import { useQuery, errorMessage } from '../lib/useQuery';
import { toCsv } from '../lib/csv';

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function Settings() {
  const { session, signOut } = useAuth();
  const toast = useToast();
  const review = useQuery(countNeedsReview, []);
  const email = session?.user.email ?? '';

  async function exportCsv() {
    try {
      const rows = await exportAllTransactions();
      const csv = toCsv([
        ['Date', 'Description', 'Category', 'Amount', 'Remarks'],
        ...rows.map((r) => [ddmmyyyy(r.occurred_on), r.description, r.category, r.amount.toFixed(2), r.needs_review ? 'To check' : '']),
      ]);
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Exported ${rows.length} expenses`);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen title="Settings">
      <main className="page stack">
        <div className="group">
          <div className="group-body">
            <div className="profile">
              <div className="avatar">{email.charAt(0).toUpperCase() || '?'}</div>
              <div className="profile-text">
                <strong>{email}</strong>
                <span>Signed in</span>
              </div>
            </div>
          </div>
        </div>

        <div className="group">
          <div className="group-body">
            <Link to="/history?review=1" className="row">
              <span className="row-icon">
                <Icon name="flag" size={18} />
              </span>
              <span className="row-label">To check</span>
              <span className="row-value num">{review.data ?? ''}</span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </div>
          <div className="group-footer">Expenses you flagged to review later.</div>
        </div>

        <div className="group">
          <div className="group-header">Manage</div>
          <div className="group-body">
            <Link to="/settings/categories" viewTransition className="row">
              <span className="row-icon">
                <Icon name="tag" size={18} />
              </span>
              <span className="row-label">Categories</span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/settings/budgets" viewTransition className="row">
              <span className="row-icon">
                <Icon name="wallet" size={18} />
              </span>
              <span className="row-label">Budgets and income</span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </div>
        </div>

        <div className="group">
          <div className="group-header">Data</div>
          <div className="group-body">
            <Link to="/settings/import" viewTransition className="row">
              <span className="row-icon">
                <Icon name="upload" size={18} />
              </span>
              <span className="row-label">Import from Google Sheets</span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <button className="row" onClick={exportCsv}>
              <span className="row-icon">
                <Icon name="download" size={18} />
              </span>
              <span className="row-label">Export backup (CSV)</span>
            </button>
          </div>
        </div>

        <div className="group">
          <div className="group-body">
            <button className="row row-center row-danger" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>

        <p className="footnote">Expense Tracker v1.0.0</p>
      </main>
    </Screen>
  );
}
