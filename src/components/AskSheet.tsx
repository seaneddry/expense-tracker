import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from './Icon';
import { useAsk } from '../lib/askContext';
import type { AskMessage } from '../lib/askContext';
import { rm, shortDate } from '../lib/format';
import '../ask.css';

const SUGGESTIONS = [
  'How much have I spent on petrol this month?',
  'What were my 5 biggest expenses this month?',
  'Am I over budget on any category?',
  'How does this month compare with last month?',
];

function Bubble({ m }: { m: AskMessage }) {
  if (m.role === 'user') return <div className="ask-msg ask-msg-user">{m.text}</div>;
  const rows = m.rows ?? [];
  return (
    <div className="ask-msg ask-msg-bot">
      <p className={m.failed ? 'ask-error' : undefined}>{m.text}</p>
      {rows.length > 0 ? (
        <ul className="ask-rows">
          {rows.map((r, i) => (
            <li key={`${r.date}-${i}`}>
              <span className="ask-row-main">
                <span className="ask-row-desc">{r.description}</span>
                <span className="ask-row-sub">
                  {shortDate(r.date)} · {r.category}
                </span>
              </span>
              <span className="ask-row-amt num">{rm(r.amount)}</span>
            </li>
          ))}
          {m.more && m.more > 0 ? <li className="ask-more">and {m.more} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function AskSheet() {
  const { messages, busy, close, send, clear } = useAsk();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    // On a phone, focusing at once would raise the keyboard over the suggestions.
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    setDraft('');
    void send(q);
  }

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section
        className="ask-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Ask about your spending"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ask-head">
          <div className="ask-grab" aria-hidden="true" />
          <div className="ask-head-row">
            <h2>Ask</h2>
            <div className="ask-head-actions">
              {messages.length > 0 ? (
                <button type="button" className="button button-quiet button-small" onClick={clear}>
                  Clear
                </button>
              ) : null}
              <button type="button" className="icon-button" aria-label="Close" onClick={close}>
                <Icon name="x" size={20} />
              </button>
            </div>
          </div>
        </header>

        <div className="ask-body" aria-live="polite">
          {messages.length === 0 ? (
            <div className="ask-empty">
              <p>Ask about your spending in plain English.</p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} m={m} />)
          )}
          {busy ? (
            <div className="ask-thinking" role="status">
              <span className="spinner ask-spinner" />
              Looking at your expenses…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <form className="ask-input" onSubmit={submit}>
          <input
            ref={inputRef}
            className="ask-field"
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={300}
            placeholder="How much did I spend on food?"
            aria-label="Your question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="ask-send" aria-label="Send" disabled={busy || draft.trim() === ''}>
            <Icon name="arrow-up" size={20} strokeWidth={2.4} />
          </button>
        </form>
      </section>
    </div>
  );
}
