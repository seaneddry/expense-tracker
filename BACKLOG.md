# Backlog

Not built yet, in rough priority order.

- Push notifications for subscription alerts (needs a scheduled Supabase function, web push keys and the app installed on the Home Screen)
- iPhone Calendar feed (subscribe once, due dates appear in the Calendar app)
- Future-dated price changes ("goes up from 1 Dec")
- Mark a charge as paid for a cycle, skip a cycle
- Variable bills (electricity, water) with an estimate and actual amounts
- Foreign-currency subscriptions with an RM estimate

- Loan tracker (money lent, repaid, outstanding per person). Needs its own migration and a new tab.
- Recurring bills (rent, car loan) that create themselves each month
- Offline queue: log an expense with no signal and sync later
- Receipt photo attached to an expense (Supabase Storage)
- Nightly CSV backup committed by a GitHub Action
- Charts: monthly trend, category over time
- Bank statement CSV import
- Category reordering
