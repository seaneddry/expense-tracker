import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addCategory, listCategories, updateCategory } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';

export function Categories() {
  const toast = useToast();
  const bump = useBump();
  const cats = useQuery(listCategories, []);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const list = cats.data ?? [];

  async function run(fn: () => Promise<void>, done?: string) {
    try {
      await fn();
      bump();
      if (done) toast(done);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    const next = list.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
    await run(() => addCategory(n, next), 'Category added');
    setName('');
  }

  return (
    <Screen
      title="Categories"
      left={
        <Link to="/settings" viewTransition className="nav-button">
          <Icon name="chevron-left" size={22} /> Settings
        </Link>
      }
    >
      <main className="page stack">
        <div className="manage-add">
          <input
            className="input"
            placeholder="New category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
            Add
          </button>
        </div>

        {cats.error ? <ErrorNotice message={cats.error} onRetry={cats.reload} /> : null}
        {!cats.data && !cats.error ? <Loading /> : null}

        {cats.data ? (
          <div className="group">
            <ul className="mlist">
              {list.map((c) => (
                <li key={c.id} className={`mrow ${c.is_active ? '' : 'mrow-hidden'}`}>
                  {editing === c.id ? (
                    <>
                      <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                      <div className="mrow-actions">
                        <button
                          className="icon-button"
                          aria-label="Save name"
                          disabled={!draft.trim()}
                          onClick={async () => {
                            await run(() => updateCategory(c.id, { name: draft.trim() }), 'Renamed');
                            setEditing(null);
                          }}
                        >
                          <Icon name="check" size={20} />
                        </button>
                        <button className="icon-button" aria-label="Cancel" onClick={() => setEditing(null)}>
                          <Icon name="x" size={20} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mrow-main">
                        <span className="mrow-name">
                          {c.name} {c.is_active ? null : <span className="badge">Hidden</span>}
                        </span>
                      </div>
                      <div className="mrow-actions">
                        <button
                          className="button button-quiet button-small"
                          onClick={() => {
                            setEditing(c.id);
                            setDraft(c.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="button button-quiet button-small"
                          onClick={() => void run(() => updateCategory(c.id, { is_active: !c.is_active }))}
                        >
                          {c.is_active ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="group-footer">
              Hidden categories stay on old expenses but no longer appear when you add a new one.
            </div>
          </div>
        ) : null}
      </main>
    </Screen>
  );
}
