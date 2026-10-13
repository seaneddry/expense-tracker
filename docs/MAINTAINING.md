# Maintaining

## Change the database

1. Add a new file in `supabase/migrations/`, named `YYYYMMDDHHMMSS_what_changed.sql`.
2. Apply it in the Supabase dashboard SQL editor (or ask Claude to apply it with the Supabase connector).
3. Update `src/types.ts` and `src/api.ts` if the shape changed.
4. Never edit a migration that has already been applied. Add a new one.

## Add a KPI to Home

1. Add the value to the `jsonb_build_object` in `dashboard_kpis` (new migration using `create or replace function`).
2. Add the field to `Kpis` in `src/types.ts`.
3. Add a `<Tile>` in `Tiles` in `src/screens/Home.tsx`.

## Money rules

- Amounts are `numeric(12,2)`, never floats.
- "Today" and month boundaries use Malaysia time (`Asia/Kuala_Lumpur`).
- Budgets and income are "from this month onward", so changing them never rewrites history.

## How the KPIs are calculated

| KPI | Formula |
|---|---|
| Average per day | spent ÷ days elapsed this month |
| Projected month end | average per day × days in month |
| Expected by today | total budget ÷ days in month × days elapsed |
| Burn rate | spent ÷ expected by today |
| Savings rate | (income − spent) ÷ income |
| Income cover | income ÷ average spend of the previous 3 full months |
| Top 3 categories | combined spend of the 3 biggest categories ÷ spent |

"Income cover" was reverse-engineered from the old sheet's "how long can I survive" figure
(5200 ÷ 3422.08 = 1.52 for Oct 2026). If your original formula differs, change `income_cover_months`.

## Release

Update `CHANGELOG.md` and the version in `package.json` and `Settings.tsx`, then push to `main`.
GitHub Actions builds and deploys. Users get the update on next open (the PWA updates itself).

## Security checklist

- Sign-ups stay disabled in Supabase Auth.
- Every new table needs `enable row level security` and an owner policy.
- Never put the `service_role` key in this repo or in the browser.

## Subscriptions module

- Tables are separate from the expense log on purpose. Do not add a foreign key between them.
- The next due date is computed, never stored: `recurring_next_due(anchor_date, cycle, today)`.
  Monthly, quarterly and yearly items keep the anchor's day of month and clamp to the end of
  shorter months (an item anchored on the 31st is due on the 28th/29th/30th in short months).
- A free trial sets `anchor_date` and `trial_ends_on` to the same date (the first real charge).
  A database check enforces this. While `trial_ends_on` is today or later the item is "in trial"
  and is left out of the monthly commitment.
- Changing an item's amount is logged to `recurring_price_history` by a database trigger.
- An alert is active when the next due date is within `alert_days` days. The tab badge counts them.
- Attachments live in the private `recurring-attachments` bucket under `<user id>/<item id>/`.
  Deleting an item removes its files first (see `deleteRecurring` in `src/api.ts`).
