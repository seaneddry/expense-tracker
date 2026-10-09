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

export function History() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(params.get('review') === '1');
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
            placeholder="Search descriptions"
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
