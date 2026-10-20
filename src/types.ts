export interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  occurred_on: string; // YYYY-MM-DD
  description: string;
  category_id: string;
  amount: number;
  needs_review: boolean;
}

export interface Suggestion {
  description: string;
  category_id: string;
  last_amount: number;
  uses: number;
}

export interface CategoryRow {
  category_id: string;
  name: string;
  amount: number;
  budget: number;
  remaining: number;
}

export interface DayTotal {
  day: string;
  amount: number;
}

export interface Kpis {
  month: string;
  days_in_month: number;
  days_elapsed: number;
  spent: number;
  year_spent: number;
  all_time_spent: number;
  vs_last_month: number;
  transaction_count: number;
  biggest_category: { name: string; amount: number } | null;
  biggest_transaction: { description: string; amount: number; occurred_on: string } | null;
  biggest_transaction_pct: number;
  avg_per_day: number;
  projected_month_end: number;
  total_budget: number;
  expected_by_today: number;
  burn_rate: number;
  weekday_total: number;
  weekend_total: number;
  income: number;
  savings: number;
  savings_rate: number;
  income_cover_months: number;
  top3_pct: number;
  no_spend_days: number;
}

export interface MonthTotal {
  month: string;
  total: number;
  transactions: number;
}

// ------------------------------------------------------- recurring payments
export type RecurringKind = 'subscription' | 'bill' | 'renewal' | 'credit';
export type RecurringCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringStatus = 'active' | 'paused' | 'cancelled';

export interface RecurringItem {
  id: string;
  name: string;
  kind: RecurringKind;
  amount: number | null;
  cycle: RecurringCycle;
  anchor_date: string;
  trial_ends_on: string | null;
  alert_days: number | null;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  url: string | null;
  status: RecurringStatus;
  ends_on: string | null;
  next_due: string | null;
  days_until: number | null;
  in_trial: boolean;
  yearly_cost: number;
  monthly_cost: number;
  alert_active: boolean;
  paid: boolean;
}

export interface RecurringInput {
  name: string;
  kind: RecurringKind;
  amount: number | null;
  cycle: RecurringCycle;
  anchor_date: string;
  trial_ends_on: string | null;
  alert_days: number | null;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  url: string | null;
}

export interface RecurringSummary {
  monthly_commitment: number;
  yearly_commitment: number;
  active_count: number;
  trial_count: number;
  alert_count: number;
}

export interface RecurringDue {
  day: string;
  item_id: string;
  name: string;
  amount: number | null;
  kind: RecurringKind;
  is_trial_end: boolean;
}

export interface PriceChange {
  id: string;
  old_amount: number;
  new_amount: number;
  changed_on: string;
}

export interface Attachment {
  id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
}
