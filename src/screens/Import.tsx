import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice } from '../components/States';
import { useAuth } from '../auth';
import { ensureCategories, getMonthlyTotals, importRows } from '../api';
import type { ImportRow } from '../api';
import { parseCsv, parseSheetAmount, parseSheetDate } from '../lib/csv';
import { errorMessage, useBump } from '../lib/useQuery';
import { monthLabel, rm } from '../lib/format';
import type { MonthTotal } from '../types';

interface Parsed {
  fileName: string;
  rows: { occurred_on: string; description: string; category: string; amount: number; needs_review: boolean; source_key: string }[];
  skipped: string[];
  skippedCount: number;
  newCategories: string[];
  total: number;
  first: string;
  last: string;
}

function parseFile(text: string, fileName: string, knownCategories: string[]): Parsed {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('The file has no rows. Export the Transactions tab as CSV and try again.');

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iDesc = col('description');
  const iCat = col('category');
  const iAmt = col('amount');
  const iRemarks = col('remarks');
  if (iDate < 0 || iDesc < 0 || iAmt < 0) {
    throw new Error('Could not find the Date, Description and Amount columns. Check the first row of the CSV.');
  }

  const seen = new Map<string, number>();
  const rows: Parsed['rows'] = [];
  const skipped: string[] = [];
  let skippedCount = 0;

  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const date = parseSheetDate(r[iDate] ?? '');
    const amount = parseSheetAmount(r[iAmt] ?? '');
    const description = (r[iDesc] ?? '').trim();
    const category = ((iCat >= 0 ? r[iCat] : '') ?? '').trim() || 'Others';
    const remarks = ((iRemarks >= 0 ? r[iRemarks] : '') ?? '').trim().toLowerCase();

    const problem = !date ? 'invalid date' : amount === null ? 'invalid amount' : !description ? 'missing description' : null;
    if (problem || !date || amount === null) {
      skippedCount++;
      if (skipped.length < 8) skipped.push(`Row ${line}: ${problem}`);
      return;
    }

    const base = `${date}|${description.toLowerCase()}|${amount.toFixed(2)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({
      occurred_on: date,
      description,
      category,
      amount,
      needs_review: remarks.includes('check'),
      source_key: `${base}|${n}`,
    });
  });

  const known = new Set(knownCategories.map((c) => c.toLowerCase()));
  const newCategories = [...new Set(rows.map((r) => r.category).filter((c) => !known.has(c.toLowerCase())))];
  const dates = rows.map((r) => r.occurred_on).sort();

  return {
    fileName,
    rows,
    skipped,
    skippedCount,
    newCategories,
    total: rows.reduce((s, r) => s + r.amount, 0),
    first: dates[0] ?? '',
    last: dates[dates.length - 1] ?? '',
  };
}

export function Import() {
  const { session } = useAuth();
  const bump = useBump();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [months, setMonths] = useState<MonthTotal[] | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setParsed(null);
    setMonths(null);
    try {
      const text = await file.text();
      const existing = await ensureCategories([]);
      setParsed(parseFile(text, file.name, existing.map((c) => c.name)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function run() {
    if (!parsed || !session) return;
    setError(null);
    setProgress(0);
    try {
      const cats = await ensureCategories(parsed.rows.map((r) => r.category));
      const ids = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
      const rows: ImportRow[] = parsed.rows.map((r) => ({
        occurred_on: r.occurred_on,
        description: r.description,
        category_id: ids.get(r.category.toLowerCase()) ?? '',
        amount: r.amount,
        needs_review: r.needs_review,
        source_key: r.source_key,
      }));
      await importRows(session.user.id, rows, setProgress);
      setMonths(await getMonthlyTotals());
      bump();
      setParsed(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  const importing = progress !== null;

  return (
    <Screen
      title="Import"
      sub="From your Google Sheet"
      left={
        <Link to="/settings" viewTransition className="nav-button">
          <Icon name="chevron-left" size={22} /> Settings
        </Link>
      }
    >
      <main className="page stack">
        <div className="notice">
          In Google Sheets open the <strong>Transactions</strong> tab, then choose <strong>File → Download → Comma-separated values (.csv)</strong>.
          Pick that file below. Importing twice is safe: expenses that are already here are skipped.
        </div>

        <label className="file-drop">
          <Icon name="upload" size={28} />
          <span>Choose the CSV file</span>
          <input type="file" accept=".csv,text/csv" disabled={importing} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>

        {error ? <ErrorNotice message={error} /> : null}

        {parsed ? (
          <>
            <div className="group">
              <div className="group-header">Ready to import</div>
              <div className="group-body">
                <div className="row">
                  <span className="row-label">Expenses</span>
                  <span className="row-value row-value-strong num">{parsed.rows.length}</span>
                </div>
                <div className="row">
                  <span className="row-label">Total amount</span>
                  <span className="row-value row-value-strong num">{rm(parsed.total)}</span>
                </div>
                <div className="row">
                  <span className="row-label">Date range</span>
                  <span className="row-value num">
                    {parsed.first} to {parsed.last}
                  </span>
                </div>
                {parsed.newCategories.length > 0 ? (
                  <div className="row">
                    <span className="row-label">
                      New categories
                      <span className="row-sub">{parsed.newCategories.join(', ')}</span>
                    </span>
                  </div>
                ) : null}
                {parsed.skippedCount > 0 ? (
                  <div className="row">
                    <span className="row-label">
                      Skipped rows
                      <span className="row-sub">{parsed.skipped.join('; ')}{parsed.skippedCount > parsed.skipped.length ? '…' : ''}</span>
                    </span>
                    <span className="row-value num">{parsed.skippedCount}</span>
                  </div>
                ) : null}
              </div>
              <div className="group-footer">
                Compare the total with your sheet before importing. After importing you will see a total for every month to check against the Monthly Summary tab.
              </div>
            </div>

            <button className="button button-primary button-block" disabled={importing || parsed.rows.length === 0} onClick={() => void run()}>
              {importing ? `Importing… ${progress} of ${parsed.rows.length}` : `Import ${parsed.rows.length} expenses`}
            </button>
          </>
        ) : null}

        {months ? (
          <div className="group">
            <div className="group-header">Imported. Monthly totals to check against your sheet</div>
            <div className="scroll-box">
              <table className="recon">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="num">{rm(m.total)}</td>
                      <td className="num">{m.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>
    </Screen>
  );
}
