# Changelog

## 1.5.0

**Remarks on expenses.** An optional note when you add or edit an expense in the web app.

- New Remarks field on the New expense / Edit expense screen (optional, up to 500 characters)
- History shows the remark in grey under the expense, and the search box now looks in remarks too
- "Ask about your expenses" also finds words in remarks
- CSV export puts the remark in the Remarks column (after "To check" if the expense is flagged)
- Apple Pay / Shortcuts entries are unchanged: they save with no remark, and you can add one later by editing
- Database: new nullable `remarks` column on `transactions` (`supabase/migrations/20261026000000_transaction_remarks.sql`)

## 1.3.0

**Ask about your spending.** Type a question and get an answer from your own transactions.

- Sparkle icon in the header of every main screen and an Ask bar at the top of Home, both opening the same chat
- Answers such as "How much have I spent on petrol this month?", "My 5 biggest expenses this month" or "Am I over budget on any category?", with the transactions behind the number shown underneath
- Follow-ups keep their context ("and last month?")
- Runs on Google Gemini's free tier through a Supabase Edge Function (`supabase/functions/ask-expenses`); the key stays on the server
- The assistant can only read: two new `security invoker` database functions, `ask_sum_spending` and `ask_search_transactions`, plus the existing budget breakdown
- Setup is in docs/SETUP.md section 5c, and docs/ASK.md explains privacy, limits and troubleshooting

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
