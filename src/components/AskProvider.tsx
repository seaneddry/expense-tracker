import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AskContext } from '../lib/askContext';
import type { AskMessage } from '../lib/askContext';
import { askExpenses } from '../lib/askApi';
import { errorMessage } from '../lib/useQuery';
import { AskSheet } from './AskSheet';

/**
 * Holds the chat so the header icon and the Home bar open the same conversation.
 * The conversation lives in memory only: it clears when you leave the main tabs or reload.
 */
export function AskProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const messagesRef = useRef(messages);
  const busyRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const clear = useCallback(() => setMessages([]), []);

  const send = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    // The last few exchanges give follow-ups like "and last month?" their context.
    const history = messagesRef.current
      .filter((m) => !m.failed)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: q }]);
    try {
      const result = await askExpenses(q, history);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: result.answer, rows: result.rows, more: result.more },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: errorMessage(e), failed: true },
      ]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const value = useMemo(
    () => ({ available: true, isOpen, messages, busy, open, close, send, clear }),
    [isOpen, messages, busy, open, close, send, clear],
  );

  return (
    <AskContext.Provider value={value}>
      {children}
      {isOpen ? <AskSheet /> : null}
    </AskContext.Provider>
  );
}
