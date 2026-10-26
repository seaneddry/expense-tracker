import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listCategories, listTransactions } from '../api';
import { useQuery } from '../lib/useQuery';
import { dayLabel, rm } from '../lib/format';
import type { Transaction } from '../types';

const PAGE = 100;

/**
 * Remembers the chosen category and "To check" pill while the app is open, so opening an
 * expense and coming back (or saving it) returns to the same filtered list.
 */
const FILTER_KEY = 'history.filters';

interface StoredFilters {
  categoryId: string | null;
  needsReview: boolean;
}

function readFilters(): StoredFilters {
  try {
    const raw = window.sessionStorage.getItem(FILTER_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<StoredFilters>;
      return { categoryId: typeof v.categoryId === 'string' ? v.categoryId : null, needsReview: v.needsReview === true };
    }
  } catch {
    // Storage unavailable (e.g. private mode): start unfiltered.
  }
  return { categoryId: null, needsReview: false };
}

function storeFilters(f: StoredFilters) {
  try {
    window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    // Storage unavailable: the filters just won't be remembered.
  }
}

export function History() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  // The "To check" link on Home opens History with only that filter on.
  const [initial] = useState<StoredFilters>(() =>
    params.get('review') === '1' ? { categoryId: null, needsReview: true } : readFilters(),
  );
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId);
  const [needsReview, setNeedsReview] = useState(initial.needsReview);

  useEffect(() => {
    storeFilters({ categoryId, needsReview });
  }, [categoryId, needsReview]);

  // Drop ?review=1 once applied, so coming back from an expense uses the remembered filters instead.
  useEffect(() => {
    if (params.has('review')) setParams({}, { replace: true });
  }, [params, setParams]);

  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => setLimit(PAGE), [debounced, categoryId, needsReview]);

  const cats = useQuery(listCategories, []);
  const txs = useQuery(
    () => listTransactions({ search: debounced, categoryId, needsReview, limit }),
    [debounced, categoryId, needsReview, limit],
  );

  // Forget a remembered category that was since hidden or deleted.
  useEffect(() => {
    if (categoryId && cats.data && !cats.data.some((c) => c.id === categoryId && c.is_active)) setCategoryId(null);
  }, [cats.data, categoryId]);

  const names = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data]);

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[]; total: number }[] = [];
    for (const t of txs.data ?? []) {
      const last = out[out.length - 1];
      if (last && last.day === t.occurred_on) {
        last.items.push(t);
        last.total += t.amount;
      } else {
        out.push({ day: t.occurred_on, items: [t], total: t.amount });
      }
    }
    return out;
  }, [txs.data]);

  const filtering = Boolean(debounced || categoryId || needsReview);

  return (
    <Screen title="History">
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Search descriptions and remarks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            enterKeyHint="search"
          />
          {search ? (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch('')}>
              <Icon name="x" size={12} strokeWidth={3} />
            </button>
          ) : null}
        </label>
      </div>

      <div className="pill-row" role="group" aria-label="Filters">
        <button
          className={`pill ${!categoryId && !needsReview ? 'pill-on' : ''}`}
          onClick={() => {
            setCategoryId(null);
            setNeedsReview(false);
          }}
        >
          All
        </button>
        <button className={`pill ${needsReview ? 'pill-on' : ''}`} onClick={() => setNeedsReview(!needsReview)}>
          To check
        </button>
        {(cats.data ?? [])
          .filter((c) => c.is_active)
          .map((c) => (
            <button
              key={c.id}
              className={`pill ${categoryId === c.id ? 'pill-on' : ''}`}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            >
              {c.name}
            </button>
          ))}
      </div>

      <main className="page stack">
        {txs.error ? <ErrorNotice message={txs.error} onRetry={txs.reload} /> : null}
        {!txs.data && !txs.error ? <Loading /> : null}

        {txs.data && groups.length === 0 ? (
          <Empty
            icon="receipt"
            title={filtering ? 'No matches' : 'No expenses yet'}
            text={filtering ? 'Try a different search or clear the filters.' : 'Tap + to log your first expense.'}
          />
        ) : null}

        {groups.map((g) => (
          <section className="group" key={g.day}>
            <div className="day-head">
              <span>{dayLabel(g.day)}</span>
              <span className="num">{rm(g.total)}</span>
            </div>
            <div className="group-body">
              {g.items.map((t) => (
                <Link key={t.id} to={`/edit/${t.id}`} viewTransition className="tx-row">
                  <div className="tx-main">
                    <span className="tx-title">{t.description}</span>
                    <span className="tx-sub">
                      {names.get(t.category_id) ?? 'Uncategorised'}
                      {t.needs_review ? (
                        <>
                          <Icon name="flag" size={13} /> To check
                        </>
                      ) : null}
                    </span>
                    {t.remarks ? <span className="tx-remarks">{t.remarks}</span> : null}
                  </div>
                  <span className="tx-amount num">{rm(t.amount)}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {txs.data && txs.data.length >= limit ? (
          <button className="button button-secondary" onClick={() => setLimit(limit + PAGE)}>
            Show more
          </button>
        ) : null}
      </main>
    </Screen>
  );
}
