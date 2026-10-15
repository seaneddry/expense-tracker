import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AskRow } from './askContext';

export interface AskTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskResult {
  answer: string;
  rows: AskRow[];
  more: number;
}

/** Sends a question to the ask-expenses Edge Function. Throws an Error with a readable message. */
export async function askExpenses(question: string, history: AskTurn[]): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke('ask-expenses', { body: { question, history } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'The assistant could not answer. Try again.');
    }
    throw new Error('Could not reach the assistant. Check your connection and try again.');
  }
  const result = data as Partial<AskResult> | null;
  return { answer: result?.answer ?? '', rows: result?.rows ?? [], more: result?.more ?? 0 };
}
