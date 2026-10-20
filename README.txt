Card / PayLater reminders + Mark as paid
========================================
Unzip into the root of your expense-tracker repo, replacing the files below.

Files in this zip
  src/screens/SubscriptionForm.tsx    replace
  src/screens/Subscriptions.tsx       replace
  src/screens/SubscriptionDetail.tsx  replace
  supabase/migrations/20261016000000_card_paylater_and_mark_paid.sql   new file (already applied to the live database)

Already done in your repo (committed on 16 Oct), so NOT in this zip
  src/types.ts, src/api.ts, src/lib/format.ts, supabase/functions/push/index.ts

Then run:  npm run typecheck
