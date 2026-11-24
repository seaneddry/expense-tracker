/** The cards in Home's KPI grid. Order here is the default order. */
export const HOME_CARDS = [
  { id: 'avg_day', label: 'Average per day' },
  { id: 'projected', label: 'Projected month end' },
  { id: 'burn_rate', label: 'Burn rate' },
  { id: 'savings', label: 'Savings' },
  { id: 'biggest_category', label: 'Biggest category' },
  { id: 'biggest_transaction', label: 'Biggest transaction' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'top3', label: 'Top 3 categories' },
  { id: 'no_spend', label: 'No-spend days' },
  { id: 'income_cover', label: 'Income cover' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'this_year', label: 'This year' },
  { id: 'all_time', label: 'All time' },
] as const;

export type HomeCardId = (typeof HOME_CARDS)[number]['id'];

export interface HomeCardPref {
  id: HomeCardId;
  visible: boolean;
}

const KNOWN = new Set<string>(HOME_CARDS.map((c) => c.id));

export function cardLabel(id: HomeCardId): string {
  return HOME_CARDS.find((c) => c.id === id)?.label ?? id;
}

/**
 * Turns what is saved into a full, clean list: unknown ids and duplicates are dropped,
 * and any card not in the saved list (e.g. added in a later version) is shown at the end.
 */
export function normaliseCards(saved: unknown): HomeCardPref[] {
  const out: HomeCardPref[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (!item || typeof item !== 'object') continue;
      const { id, visible } = item as { id?: unknown; visible?: unknown };
      if (typeof id !== 'string' || !KNOWN.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id: id as HomeCardId, visible: visible !== false });
    }
  }
  for (const c of HOME_CARDS) if (!seen.has(c.id)) out.push({ id: c.id, visible: true });
  return out;
}

/** How Home's "By category" section is drawn. */
export type CategoryView = 'attention' | 'rings' | 'allocation';

export const CATEGORY_VIEWS: { id: CategoryView; label: string }[] = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'rings', label: 'Rings' },
  { id: 'allocation', label: 'One bar' },
];

export function normaliseCategoryView(saved: unknown): CategoryView {
  return saved === 'rings' || saved === 'allocation' ? saved : 'attention';
}

export interface HomePrefs {
  cards: HomeCardPref[];
  categoryView: CategoryView;
}
