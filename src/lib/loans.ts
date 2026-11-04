import type { LoanEntry, LoanPayment } from '../types';
import { rm, shortDate } from './format';

/**
 * Works out which IOUs are still open for one friend.
 *
 * Repayments clear the oldest items first. Items in opposite directions cancel out too:
 * if Ali owes you RM95 and you owe Ali RM30, RM30 of each is treated as settled and Ali
 * owes you RM65 net. All maths is in whole sen to avoid rounding drift.
 *
 * The same logic runs in supabase/functions/ask-expenses/index.ts (openItems). Keep them in step.
 */
export interface ItemStatus {
  entry: LoanEntry;
  /** How much of this item has been paid back or cancelled out. */
  covered: number;
  /** What is still open on this item. */
  open: number;
}

const sen = (n: number) => Math.round(n * 100);

export function allocate(entries: LoanEntry[], payments: LoanPayment[]): ItemStatus[] {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const lent = entries.filter((e) => e.direction === 'lent');
  const borrowed = entries.filter((e) => e.direction === 'borrowed');
  const A = sum(lent.map((e) => sen(e.amount)));
  const B = sum(borrowed.map((e) => sen(e.amount)));
  const R = sum(payments.filter((p) => p.direction === 'received').map((p) => sen(p.amount)));
  const P = sum(payments.filter((p) => p.direction === 'paid').map((p) => sen(p.amount)));
  const offset = Math.max(0, Math.min(A - R, B - P));

  const byDate = (a: LoanEntry, b: LoanEntry) =>
    a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at);

  const fill = (items: LoanEntry[], credit: number): ItemStatus[] => {
    let left = Math.max(0, credit);
    return [...items].sort(byDate).map((entry) => {
      const amt = sen(entry.amount);
      const c = Math.min(amt, left);
      left -= c;
      return { entry, covered: c / 100, open: (amt - c) / 100 };
    });
  };

  return [...fill(lent, R + offset), ...fill(borrowed, P + offset)];
}

/** Malaysian numbers: 012-345 6789 -> 60123456789. Returns null if it doesn't look like a phone number. */
export function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `6${d}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** A WhatsApp link with a friendly reminder. Without a phone number, WhatsApp asks who to send it to. */
export function reminderLink(name: string, phone: string | null, owed: number, open: ItemStatus[]): string {
  const lines = open
    .filter((s) => s.entry.direction === 'lent' && s.open > 0)
    .slice(-5)
    .map((s) => `- ${s.entry.description} (${shortDate(s.entry.occurred_on)}): ${rm(s.open)}`);
  const first = name.trim().split(/\s+/)[0];
  const text = [
    `Hi ${first}! Just a friendly reminder, you owe me ${rm(owed)}.`,
    ...(lines.length > 0 ? ['', ...lines] : []),
    '',
    'Thanks!',
  ].join('\n');
  const number = waNumber(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/** "Ali owes you", "You owe Ali", "All settled" */
export function netLabel(name: string, net: number): string {
  if (Math.abs(net) < 0.005) return 'All settled';
  return net > 0 ? `${name} owes you` : `You owe ${name}`;
}

/** Totals across all friends: what friends owe you, and what you owe friends. */
export function totals(list: { net: number }[]): { owed: number; owe: number; people: number } {
  let owed = 0;
  let owe = 0;
  let people = 0;
  for (const f of list) {
    if (f.net > 0.004) owed += f.net;
    if (f.net < -0.004) owe -= f.net;
    if (Math.abs(f.net) > 0.004) people += 1;
  }
  return { owed: Math.round(owed * 100) / 100, owe: Math.round(owe * 100) / 100, people };
}
