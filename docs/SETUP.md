# Setup guide (no terminal)

Everything runs in the cloud: GitHub builds and hosts the app, Supabase stores the data.
You only need a browser, GitHub Desktop and the unzipped folder.

## 1. Create your login (Supabase)

The database already exists with the schema applied. Project: `expense-tracker`.

1. Open the Supabase dashboard and choose the `expense-tracker` project.
2. **Authentication > Users > Add user > Create new user.** Enter your email and a strong
   password, and tick **Auto Confirm User**. The default categories, budgets and income are
   added automatically.
3. **Authentication > Sign In / Providers**, section "User Signups": turn **off**
   "Allow new users to sign up".

## 2. Put the folder in GitHub Desktop

1. Unzip `expense-tracker.zip` into a folder you will keep, for example `Documents/GitHub`.
   Open the result and check that `package.json` is directly inside the `expense-tracker`
   folder (not inside a second `expense-tracker` folder).
2. GitHub Desktop: **File > Add local repository** and choose that `expense-tracker` folder.
3. It will say the folder is not a Git repository. Click **create a repository**, keep the name
   `expense-tracker`, and click **Create repository**.
4. In the left panel you should see all the files, including `.github/workflows/deploy.yml`.
   Type `Expense tracker v1.0.0` in the Summary box and click **Commit to main**.
5. Click **Publish repository**. **Untick "Keep this code private"** (GitHub Pages is free
   only for public repositories; the code holds no secrets) and click **Publish repository**.

The repository must be named exactly `expense-tracker`, because the app's web address depends on it.

## 3. Switch on hosting (github.com)

Open your new repository on github.com.

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. **Settings > Secrets and variables > Actions > Variables tab > New repository variable.**
   Add these two, one at a time:
   - Name `VITE_SUPABASE_URL`, value `https://sqtfdpxhtnspdnthabwj.supabase.co`
   - Name `VITE_SUPABASE_PUBLISHABLE_KEY`, value: copy the text after the `=` on the second
     line of `.env.example`.
3. **Actions** tab. Open the latest run of "Deploy to GitHub Pages" (it probably failed because
   the variables did not exist yet) and click **Re-run all jobs**.
4. After about 2 minutes both steps turn green. Your app is at
   `https://<your-github-username>.github.io/expense-tracker/`.

If a step turns red, click it, copy the red error text and send it to Claude.
A failed "typecheck" step with an orange warning is not a problem: the app still deploys.

## 4. Sign in and import your sheet

1. Open the web address and sign in with the login from step 1.
2. In Google Sheets open the **Transactions** tab: **File > Download > Comma-separated values (.csv)**.
3. In the app: **Settings > Import from Google Sheets**, choose the file.
4. Check the expense count and total against your sheet, then tap **Import**.
5. Compare the monthly totals it shows with your **Monthly Summary** tab.
   Importing the same file twice is safe: existing expenses are skipped.
6. **Settings > Budgets and income**: income defaulted to RM5,200 (your sheet also showed
   RM6,136 nearby). Change it if that is the right figure.

## 5. Install on your phone

Open the web address in **Safari** on iPhone: **Share > Add to Home Screen**.
On Android Chrome: menu **> Install app**.

## 5b. Turn on phone notifications

1. Open the app from the **Home Screen icon** (not from Safari).
2. **Settings > Notifications > Turn on notifications**, then tap **Allow** on the iPhone prompt.
3. Tap **Send a test notification**. It should arrive within a few seconds.
4. Set an alert time on each subscription. You get one notification per charge, around 9:00 AM Malaysia time,
   on the day its alert window opens.

If the prompt never appears, check iPhone **Settings > Notifications > Expense Tracker** and make sure Allow Notifications is on.

## 5c. Turn on Ask (optional)

Ask lets you type a question like "How much have I spent on petrol this month?" and get an answer from your own
transactions. It uses Google's free Gemini tier, which needs no card. One thing to know first: on the free tier Google
may use what you send it to improve its products. Each question sends your question and the few transaction rows
it needs (dates, descriptions, categories, amounts), never the whole table. Details are in [ASK.md](ASK.md). Skip this
section if you would rather not.

1. **Add the database functions.** In Supabase, open **SQL Editor > New query**. Open
   `supabase/migrations/20261014000000_ask_expenses.sql` from the folder, copy everything into the editor and click **Run**.
2. **Get a free Gemini key.** Go to **aistudio.google.com/apikey**, sign in with a Google account and click
   **Create API key**. Copy it.
3. **Save the key as a secret.** In Supabase, open **Edge Functions > Secrets** and add a secret named
   `GEMINI_API_KEY` with the key as its value. Never paste the key into the repo or `.env.local`.
4. **Deploy the function.** In Supabase, open **Edge Functions > Deploy a new function** and choose the in-browser editor.
   Name it `ask-expenses`, replace the starter code with everything in `supabase/functions/ask-expenses/index.ts`
   and deploy. Leave **Verify JWT** on.
5. **Publish the app update.** In GitHub Desktop, write a summary, click **Commit to main** and **Push origin**
   (same as section 6). Wait about 2 minutes.
6. **Try it.** Open the app, tap the sparkle icon at the top right of any main screen, or the **Ask about your spending**
   bar on Home, then tap a suggested question.

If you see an error message, [ASK.md](ASK.md) lists what each one means.

## 6. Updating the app later

Change files in the folder, then in GitHub Desktop write a summary, click **Commit to main**
and **Push origin**. GitHub rebuilds and republishes automatically in about 2 minutes.

## 7. Run both for two weeks

Log new expenses only in the app, leave the sheet as a safety net, and compare month totals.
Back up any time from **Settings > Export backup (CSV)**.
