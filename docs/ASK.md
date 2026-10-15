# Ask about your spending

Ask lets you type a question such as "How much have I spent on petrol this month?" and get an answer
worked out from your own transactions. It opens from a sparkle icon in the header of every main screen
and from a bar at the top of Home.

To turn it on, follow section 5c of [SETUP.md](SETUP.md). This page explains how it works, what it costs
and what to do when something goes wrong.

## Optional settings

Add these as Edge Function secrets (Supabase dashboard, Edge Functions, Secrets) if you want to change them:

- `ASK_MODEL` picks the model. The default is `gemini-3.5-flash-lite`, which has a free tier and suits simple
  lookups. If answers ever seem muddled, try `gemini-3.6-flash`, which also has a free tier.
- `ASK_THINKING_LEVEL` sets how much the model thinks. Leave it unset unless Google's docs list the value you
  want for your model.

After changing a secret, redeploy the function if the new value does not seem to apply.

## What it costs, and the catch

On Google's free tier the default model (`gemini-3.5-flash-lite`) is free of charge, with no card needed. Two things to know:

- **Privacy.** On the free tier, Google's terms allow your prompts and answers to be used to improve its
  products. Each question sends Gemini your question and the transaction rows the lookup returns
  (dates, descriptions, categories, amounts). It never receives your whole table, and the function asks
  Google not to store the conversation. If that is not acceptable, enabling billing on the Google project
  moves it to the paid tier, where content is not used to improve products. Paid use at this size
  would be a few cents a month, but check Google's current prices first.
- **Limits.** The free tier has per-minute and per-day request limits that depend on the model and can
  change. Your project's actual limits are shown in AI Studio. If you hit one, the app says the free
  limit has been reached and to try again later.

## How it stays safe

- The Gemini key lives only in the Edge Function secret. The browser never sees it.
- Every database call runs as you, with your login token. Row level security means it can only read your
  own rows, even if the model misbehaved.
- The assistant has four read-only tools: list categories, sum spending, search transactions, and budget
  status. It cannot add, change, or delete anything.
- Transaction descriptions are treated as data, not instructions.
- Each question is capped at 300 characters and six tool round-trips.

## Good to know

- The conversation is kept in memory only. It clears when you reload, tap Clear, or open the Add screen
  (which sits outside the main tabs).
- "Petrol" only works if a category or description matches. The assistant looks at your category list
  first, then falls back to searching descriptions. If an answer says there is nothing, check the names
  under Settings, Categories.
- Under each answer the app shows the latest transactions behind it, up to eight, with a count of the rest.
- There is no per-user rate limit in the app. For a personal app, Google's free-tier limits are the cap.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "The assistant is not set up yet (missing GEMINI_API_KEY)" | Add the secret again (SETUP.md 5c, step 3), then redeploy the function |
| "Your session expired. Sign in again." | Sign out of the app and back in |
| "Could not reach the assistant" | The function is not deployed yet (SETUP.md 5c, step 4), or you are offline |
| "The free Gemini limit has been reached for now" | Wait a minute, or until tomorrow. Limits are shown in AI Studio |
| "The assistant is unavailable right now" | Check the key and that the model name is valid. Details are in the function logs |
| Answers say there is no spending for something you know you spent on | The category has a different name. Ask using the shop name instead |

Function logs: Dashboard, Edge Functions, `ask-expenses`, Logs.
