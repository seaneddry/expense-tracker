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
