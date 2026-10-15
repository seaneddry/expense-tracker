# Expense Tracker

A mobile-first personal expense tracker. Log spending in a few taps, see where the money goes.
Replaces the old Google Sheets + Apps Script setup.

- **Frontend:** React, TypeScript, Vite, React Router. Installable PWA.
- **Backend:** Supabase (Postgres, Auth, row-level security). No server code.
- **Notifications:** Web Push through a Supabase Edge Function and a daily pg_cron job.
- **Ask:** plain-English questions about your spending, answered by Google Gemini through a Supabase Edge Function (free tier).
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every push to `main`.
- **Look and feel:** the `my-wardrobe` design system (iOS-style, monochrome, light and dark).

## Screens

| Tab | What it does |
|---|---|
| Home | Month picker, spent so far, budget pace, KPIs, category vs budget, day-by-day calendar |
| History | Search, filter by category or "To check", edit or delete |
| + | Quick add: amount, description (autocomplete fills the category), date, category |
| Subscriptions | Recurring payments: upcoming list, calendar, monthly commitment, alerts, trials, price history |
| Settings | Notifications, categories, budgets and income, import from Google Sheets, CSV backup, sign out |

Ask is not a tab. Open it from the sparkle icon in the header of any main screen or the bar at the top of Home,
then type a question such as "How much have I spent on petrol this month?". See [docs/ASK.md](docs/ASK.md).

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
  components/       Screen (large title), TabBar, Toast, ConfirmSheet, AskProvider, AskSheet, AskButton
  screens/          Home, History, TransactionForm, Settings, Categories, Budgets, Import
  styles.css        design system ported from my-wardrobe + expense components
supabase/migrations  the database schema (already applied to the live project)
supabase/functions   Edge Functions: push (notifications), ask-expenses (Ask)
docs/               setup and maintenance guides
```

## Data model

`categories`, `transactions`, `budgets` (a row applies from `effective_from` onward), `income`
(same idea), plus the views `monthly_totals` and `description_suggestions` and the functions
`dashboard_kpis`, `category_breakdown` and `daily_totals`.

The Subscriptions module has its own tables (`recurring_items`, `recurring_price_history`,
`recurring_attachments`), the view `recurring_overview`, the functions `recurring_summary`,
`recurring_calendar` and `recurring_next_due`, and a private storage bucket. It never reads from
or writes to the expense log. Ask adds two read-only functions, `ask_sum_spending` and
`ask_search_transactions`. The dashboard maths lives in SQL, so any
future client gets identical numbers. Every table is locked to its owner with row-level security.
