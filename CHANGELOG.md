# Changelog

## 1.2.0

Phone push notifications for subscription alerts.

- Settings > Notifications: turn on, send a test, turn off (per device)
- One notification per charge, around 9:00 AM Malaysia time on the day its alert window opens
- Free trials alert before they end so you can cancel; yearly renewals use their longer lead time
- More than three items on the same day are combined into one summary notification
- Tapping a notification opens that subscription
- Built on Web Push: a Supabase Edge Function (`supabase/functions/push`), a daily pg_cron job and a service-worker handler

## 1.1.0

New **Subscriptions** module for recurring payments, completely separate from the expense log.

- Upcoming list grouped by This week, Later this month, Later
- Monthly commitment (items in a free trial are not counted until the trial ends) and yearly cost per item
- Calendar view with a dot on every due date
- Alerts before the due date, set per item (1 to 30 days). Flagged items show a bell and a count badge on the tab
- Free trial end date with a "cancel before" banner
- Price history, recorded automatically whenever the amount changes
- Yearly renewals (default alert 30 days ahead)
- Optional attachments (photo or PDF, private storage)
- Pause, resume, mark as cancelled, delete
- Tab bar now has five tabs

## 1.0.0

First release, replacing the Google Sheets tracker.

- Quick add with description autocomplete that fills the category
- History with search, category filter and "To check" review
- Home dashboard: spent, budget pace, KPIs, category vs budget, day-by-day calendar
- Categories, budgets and income management (budgets apply from a month onward)
- One-time CSV import from the old Google Sheet with monthly reconciliation
- CSV export backup
- Installable PWA, light and dark mode
