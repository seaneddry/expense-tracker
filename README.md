# Expense Tracker

A mobile-first personal expense tracker. Log spending in a few taps, see where the money goes.
Replaces the old Google Sheets + Apps Script setup.

- **Frontend:** React, TypeScript, Vite, React Router. Installable PWA.
- **Backend:** Supabase (Postgres, Auth, row-level security). No server code.
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every push to `main`.
- **Look and feel:** the `my-wardrobe` design system (iOS-style, monochrome, light and dark).

## Screens

| Tab | What it does |
|---|---|
| Home | Month picker, spent so far, budget pace, KPIs, category vs budget, day-by-day calendar |
| History | Search, filter by category or "To check", edit or delete |
| + | Quick add: amount, description (autocomplete fills the category), date, category |
| Settings | Categories, budgets and income, import from Google Sheets, CSV backup, sign out |

## Quick start

See [docs/SETUP.md](docs/SETUP.md) for the full step-by-step guide.

No terminal needed: push to GitHub with GitHub Desktop and GitHub Actions builds and hosts it.
Developers can also run it locally: `npm install`, copy `.env.example` to `.env.local`, `npm run dev`.

## Project layout

```
src/
  api.ts            every Supabase call lives here
  auth.tsx          email + password session
  lib/              formatting, CSV parsing, tiny data hook
  components/       Screen (large title), TabBar, Toast, ConfirmSheet
  screens/          Home, History, TransactionForm, Settings, Categories, Budgets, Import
  styles.css        design system ported from my-wardrobe + expense components
supabase/migrations  the database schema (already applied to the live project)
docs/               setup and maintenance guides
```

## Data model

`categories`, `transactions`, `budgets` (a row applies from `effective_from` onward), `income`
(same idea), plus the views `monthly_totals` and `description_suggestions` and the functions
`dashboard_kpis`, `category_breakdown` and `daily_totals`. The dashboard maths lives in SQL, so any
future client gets identical numbers. Every table is locked to its owner with row-level security.
