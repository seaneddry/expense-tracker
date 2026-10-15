import { createContext, useContext } from 'react';

export interface AskRow {
  date: string;
  description: string;
  category: string;
  amount: number;
}

export interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Transactions behind the answer, shown under it. */
  rows?: AskRow[];
  /** How many more matching transactions there are beyond `rows`. */
  more?: number;
  failed?: boolean;
}

export interface AskContextValue {
  /** False outside the main tabs, where there is no chat to open. */
  available: boolean;
  isOpen: boolean;
  messages: AskMessage[];
  busy: boolean;
  open: () => void;
  close: () => void;
  send: (question: string) => Promise<void>;
  clear: () => void;
}

const noop = () => {};

export const AskContext = createContext<AskContextValue>({
  available: false,
  isOpen: false,
  messages: [],
  busy: false,
  open: noop,
  close: noop,
  send: async () => {},
  clear: noop,
});

export function useAsk(): AskContextValue {
  return useContext(AskContext);
}
