import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { createFriend, getFriendBalance, updateFriend } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';

/** Add (/friends/new) or edit (/friends/:id/edit) a friend. */
export function FriendForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const existing = useQuery(() => (id ? getFriendBalance(id) : Promise.resolve(null)), [id]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const f = existing.data;
    if (f && !loaded.current) {
      loaded.current = true;
      setName(f.name);
      setPhone(f.phone ?? '');
    }
  }, [existing.data]);

  const valid = name.trim().length > 0 && name.trim().length <= 60;

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate(id ? `/friends/${id}` : '/friends', { replace: true });
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (id) {
        await updateFriend(id, name, phone || null);
        bump();
        toast('Saved');
        navigate(`/friends/${id}`, { replace: true, viewTransition: true });
      } else {
        const newId = await createFriend(name, phone || null);
        bump();
        toast(`Added ${name.trim()}`);
        navigate(`/friends/${newId}`, { replace: true, viewTransition: true });
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const ready = !editing || Boolean(existing.data);

  return (
    <Screen
      title={editing ? 'Edit friend' : 'New friend'}
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
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}
        {editing && !existing.data && !existing.error ? <Loading /> : null}
        {ready ? (
          <>
            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Name</span>
                  <input
                    autoFocus={!editing}
                    maxLength={60}
                    placeholder="Friend's name"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="row-input">
                  <span className="row-label">Phone</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={30}
                    placeholder="Optional"
                    autoComplete="off"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>
              <div className="group-footer">The phone number is only used to open WhatsApp when you send a reminder.</div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add friend'}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
