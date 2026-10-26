import { supabase } from './supabase';
import type { Category, CategoryRow, DayTotal, Kpis, MonthTotal, Suggestion, Transaction } from './types';

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- categories
/** Categories that always go to the end of every list, whatever their name. */
const LAST_CATEGORIES = ['n/a'];

/** A to Z (ignoring case), with N/A last. Used by Settings > Categories, New expense and History. */
export function sortCategories<T extends { name: string }>(list: T[]): T[] {
  const last = (c: T) => (LAST_CATEGORIES.includes(c.name.trim().toLowerCase()) ? 1 : 0);
  return [...list].sort(
    (a, b) => last(a) - last(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  );
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id,name,sort_order,is_active');
  fail(error);
  return sortCategories((data ?? []) as Category[]);
}

export async function addCategory(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name: name.trim(), sort_order: sortOrder });
  fail(error);
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'is_active'>>): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  fail(error);
}

export interface CategoryUsage {
  /** Expenses that use this category. If more than 0, the category can't be deleted. */
  transactions: number;
  /** Budget rows set for this category (removed along with it). */
  budgets: number;
}

export async function getCategoryUsage(id: string): Promise<CategoryUsage> {
  const [tx, bu] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', id),
    supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('category_id', id).gt('amount', 0),
  ]);
  fail(tx.error);
  fail(bu.error);
  return { transactions: tx.count ?? 0, budgets: bu.count ?? 0 };
}

/**
 * Deletes a category that no expense uses. The database also refuses to delete a category
 * that still has expenses (foreign key "on delete restrict"), so expenses can never lose it,
 * even if one was logged (e.g. by Apple Pay) between the check and the delete.
 */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error && (error as { code?: string }).code === '23503') {
    throw new Error('An expense now uses this category, so it was not deleted. Hide it instead.');
  }
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
    .select('id,occurred_on,description,category_id,amount,needs_review,remarks')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(f.limit);
  // Strip characters that have meaning inside a PostgREST or() filter.
  const term = f.search.trim().replace(/[%,()"\\*]/g, ' ').trim();
  if (term) q = q.or(`description.ilike."%${term}%",remarks.ilike."%${term}%"`);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.needsReview) q = q.eq('needs_review', true);
  const { data, error } = await q;
  fail(error);
  return (data ?? []) as Transaction[];
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id,occurred_on,description,category_id,amount,needs_review,remarks')
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
      .select('id,occurred_on,description,category_id,amount,needs_review,remarks')
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

// ============================================================ recurring payments
// A separate module: nothing here reads from or writes to the expense log.
import type {
  Attachment,
  PriceChange,
  RecurringDue,
  RecurringInput,
  RecurringItem,
  RecurringSummary,
} from './types';

const OVERVIEW_COLS =
  'id,name,kind,amount,cycle,anchor_date,trial_ends_on,alert_days,category,payment_method,notes,url,status,ends_on,next_due,days_until,in_trial,yearly_cost,monthly_cost,alert_active,paid';
const BUCKET = 'recurring-attachments';

export async function listRecurring(): Promise<RecurringItem[]> {
  const { data, error } = await supabase
    .from('recurring_overview')
    .select(OVERVIEW_COLS)
    .order('next_due', { ascending: true, nullsFirst: false })
    .order('name');
  fail(error);
  return (data ?? []) as RecurringItem[];
}

export async function getRecurring(id: string): Promise<RecurringItem | null> {
  const { data, error } = await supabase.from('recurring_overview').select(OVERVIEW_COLS).eq('id', id).maybeSingle();
  fail(error);
  return (data as RecurringItem | null) ?? null;
}

export async function getRecurringSummary(): Promise<RecurringSummary> {
  const { data, error } = await supabase.rpc('recurring_summary');
  fail(error);
  return data as RecurringSummary;
}

export async function getRecurringCalendar(month: string): Promise<RecurringDue[]> {
  const { data, error } = await supabase.rpc('recurring_calendar', { p_month: month });
  fail(error);
  return (data ?? []) as RecurringDue[];
}

export async function createRecurring(input: RecurringInput): Promise<string> {
  const { data, error } = await supabase.from('recurring_items').insert(input).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

export async function updateRecurring(
  id: string,
  patch: Partial<RecurringInput> & { status?: string; ends_on?: string | null; last_paid_due?: string | null },
): Promise<void> {
  const { error } = await supabase.from('recurring_items').update(patch).eq('id', id);
  fail(error);
}

export async function deleteRecurring(id: string): Promise<void> {
  // Remove the stored files first; the database rows go with the item.
  const files = await listAttachments(id);
  if (files.length > 0) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
    fail(storageError);
  }
  const { error } = await supabase.from('recurring_items').delete().eq('id', id);
  fail(error);
}

export async function listPriceHistory(itemId: string): Promise<PriceChange[]> {
  const { data, error } = await supabase
    .from('recurring_price_history')
    .select('id,old_amount,new_amount,changed_on')
    .eq('item_id', itemId)
    .order('changed_on', { ascending: false })
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as PriceChange[];
}

export async function listAttachments(itemId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('recurring_attachments')
    .select('id,storage_path,file_name,content_type,size_bytes')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as Attachment[];
}

export async function uploadAttachment(userId: string, itemId: string, file: File): Promise<void> {
  if (!file.type) throw new Error('Could not tell what kind of file this is. Use a photo or a PDF.');
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${userId}/${itemId}/${crypto.randomUUID()}-${safe}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  fail(uploadError);
  const { error } = await supabase.from('recurring_attachments').insert({
    item_id: itemId,
    storage_path: path,
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  fail(error);
  return (data as { signedUrl: string }).signedUrl;
}

export async function deleteAttachment(att: Attachment): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([att.storage_path]);
  fail(storageError);
  const { error } = await supabase.from('recurring_attachments').delete().eq('id', att.id);
  fail(error);
}
