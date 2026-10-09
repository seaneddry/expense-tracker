import { supabase } from './supabase';
import type { Category, CategoryRow, DayTotal, Kpis, MonthTotal, Suggestion, Transaction } from './types';

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- categories
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,sort_order,is_active')
    .order('sort_order')
    .order('name');
  fail(error);
  return (data ?? []) as Category[];
}

export async function addCategory(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name: name.trim(), sort_order: sortOrder });
  fail(error);
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'is_active'>>): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  fail(error);
}

// -------------------------------------------------------------- transactions
export interface TxFilter {
  search: string;
  categoryId: string | null;
  needsReview: boolean;
  limit: number;
}

export async function listTransactions(f: TxFilter): Promise<Transaction[]> {
  let q = supabase
    .from('transactions')
    .select('id,occurred_on,description,category_id,amount,needs_review')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(f.limit);
  const term = f.search.trim().replace(/[%,()]/g, ' ');
  if (term) q = q.ilike('description', `%${term}%`);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.needsReview) q = q.eq('needs_review', true);
  const { data, error } = await q;
  fail(error);
  return (data ?? []) as Transaction[];
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id,occurred_on,description,category_id,amount,needs_review')
    .eq('id', id)
    .maybeSingle();
  fail(error);
  return (data as Transaction | null) ?? null;
}

export type TxInput = Omit<Transaction, 'id'>;

export async function createTransaction(input: TxInput): Promise<void> {
  const { error } = await supabase.from('transactions').insert(input);
  fail(error);
}

export async function updateTransaction(id: string, input: TxInput): Promise<void> {
  const { error } = await supabase.from('transactions').update(input).eq('id', id);
  fail(error);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  fail(error);
}

export async function countNeedsReview(): Promise<number> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('needs_review', true);
  fail(error);
  return count ?? 0;
}

export async function listSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from('description_suggestions')
    .select('description,category_id,last_amount,uses')
    .order('uses', { ascending: false })
    .limit(1000);
  fail(error);
  return (data ?? []) as Suggestion[];
}

// ----------------------------------------------------------------- dashboard
export async function getKpis(month: string): Promise<Kpis> {
  const { data, error } = await supabase.rpc('dashboard_kpis', { p_month: month });
  fail(error);
  return data as Kpis;
}

export async function getCategoryBreakdown(month: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase.rpc('category_breakdown', { p_month: month });
  fail(error);
  return (data ?? []) as CategoryRow[];
}

export async function getDailyTotals(month: string): Promise<DayTotal[]> {
  const { data, error } = await supabase.rpc('daily_totals', { p_month: month });
  fail(error);
  return (data ?? []) as DayTotal[];
}

export async function getMonthlyTotals(): Promise<MonthTotal[]> {
  const { data, error } = await supabase
    .from('monthly_totals')
    .select('month,total,transactions')
    .order('month', { ascending: false });
  fail(error);
  return (data ?? []) as MonthTotal[];
}

// ------------------------------------------------------------ budgets, income
export async function upsertBudget(categoryId: string, month: string, amount: number): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .upsert({ category_id: categoryId, effective_from: month, amount }, { onConflict: 'category_id,effective_from' });
  fail(error);
}

export async function getIncome(month: string): Promise<number> {
  const { data, error } = await supabase
    .from('income')
    .select('amount')
    .lte('effective_from', month)
    .order('effective_from', { ascending: false })
    .limit(1);
  fail(error);
  return Number(data?.[0]?.amount ?? 0);
}

export async function upsertIncome(userId: string, month: string, amount: number): Promise<void> {
  const { error } = await supabase
    .from('income')
    .upsert({ user_id: userId, effective_from: month, amount }, { onConflict: 'user_id,effective_from' });
  fail(error);
}

// -------------------------------------------------------------------- import
export interface ImportRow {
  occurred_on: string;
  description: string;
  category_id: string;
  amount: number;
  needs_review: boolean;
  source_key: string;
}

/** Inserts in batches. Rows whose source_key already exists are skipped, so re-importing is safe. */
export async function importRows(userId: string, rows: ImportRow[], onProgress: (done: number) => void): Promise<void> {
  const size = 400;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size).map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'user_id,source_key', ignoreDuplicates: true });
    fail(error);
    onProgress(Math.min(i + size, rows.length));
  }
}

export async function exportAllTransactions(): Promise<(Transaction & { category: string })[]> {
  const cats = await listCategories();
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const out: (Transaction & { category: string })[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,occurred_on,description,category_id,amount,needs_review')
      .order('occurred_on')
      .order('created_at')
      .range(from, from + page - 1);
    fail(error);
    const rows = (data ?? []) as Transaction[];
    for (const r of rows) out.push({ ...r, category: names.get(r.category_id) ?? '' });
    if (rows.length < page) break;
  }
  return out;
}

/** Creates any categories that do not exist yet (case-insensitive) and returns the full list. */
export async function ensureCategories(names: string[]): Promise<Category[]> {
  const existing = await listCategories();
  const known = new Set(existing.map((c) => c.name.toLowerCase()));
  const missing = [...new Set(names.map((n) => n.trim()).filter((n) => n && !known.has(n.toLowerCase())))];
  if (missing.length > 0) {
    const start = existing.reduce((max, c) => Math.max(max, c.sort_order), 0);
    const { error } = await supabase
      .from('categories')
      .insert(missing.map((name, i) => ({ name, sort_order: start + i + 1 })));
    fail(error);
  }
  return listCategories();
}
