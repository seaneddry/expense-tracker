// Sends Web Push notifications for subscription alerts.
//
// Two ways in:
//  - A signed-in user (browser): action "public-key" or "test".
//  - The daily cron job (header x-cron-secret): action "run".
// The VAPID key pair is generated here on first use and kept in public.push_config,
// which only the service role can read.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

interface Cfg {
  vapid_public: string;
  vapid_private: string;
  contact: string | null;
  cron_secret: string;
}

async function loadConfig(contact?: string): Promise<Cfg> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from('push_config')
      .select('vapid_public,vapid_private,contact,cron_secret')
      .eq('id', 1)
      .single();
    if (error || !data) throw new Error('push_config is missing: ' + (error?.message ?? 'no row'));
    if (data.vapid_public && data.vapid_private) return data as Cfg;
    const keys = webpush.generateVAPIDKeys();
    // Only the first writer wins, so two parallel calls cannot overwrite each other's keys.
    await admin
      .from('push_config')
      .update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey, contact: contact ?? data.contact })
      .eq('id', 1)
      .is('vapid_public', null);
  }
  throw new Error('Could not create push keys');
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendAll(subs: Sub[], payload: unknown, cfg: Cfg): Promise<number> {
  webpush.setVapidDetails(
    cfg.contact ? `mailto:${cfg.contact}` : 'mailto:notifications@example.com',
    cfg.vapid_public,
    cfg.vapid_private,
  );
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 86400, urgency: 'high' },
      );
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        // The phone removed this subscription (app deleted or notifications turned off).
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push failed', code, (e as Error).message);
      }
    }
  }
  return delivered;
}

const rm = (n: number) => 'RM' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

interface Due {
  user_id: string;
  item_id: string;
  name: string;
  kind: string;
  // Null for card and PayLater reminders, which have no fixed amount.
  amount: number | null;
  next_due: string;
  days_until: number;
  is_trial: boolean;
}

function messageFor(d: Due) {
  const amount = d.amount === null ? null : rm(d.amount);
  const on = dateLabel(d.next_due);
  if (d.is_trial) {
    return {
      title: `${d.name}: free trial ends ${when(d.days_until)}`,
      body: `Cancel before ${on} to avoid the ${amount ? amount + ' ' : ''}charge.`,
    };
  }
  const body = amount ? `${amount} on ${on}.` : `Due on ${on}.`;
  if (d.kind === 'renewal') {
    return { title: `${d.name} renews ${when(d.days_until)}`, body };
  }
  return { title: `${d.name} is due ${when(d.days_until)}`, body };
}

async function runAlerts(cfg: Cfg) {
  const { data, error } = await admin.rpc('push_due_alerts');
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Due[];

  const byUser = new Map<string, Due[]>();
  for (const d of due) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);

  let notifications = 0;
  for (const [userId, items] of byUser) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) continue;

    // Up to 3 items get their own notification; more are summarised in one.
    const payloads =
      items.length <= 3
        ? items.map((d) => ({ ...messageFor(d), url: `subscriptions/${d.item_id}`, tag: d.item_id, items: [d] }))
        : [
            {
              title: `${items.length} payments coming up`,
              body: items.slice(0, 4).map((d) => d.name).join(', ') + (items.length > 4 ? ' and more' : ''),
              url: 'subscriptions',
              tag: 'summary',
              items,
            },
          ];

    for (const p of payloads) {
      const { items: covered, ...payload } = p;
      const delivered = await sendAll(subs as Sub[], payload, cfg);
      if (delivered > 0) {
        notifications++;
        await admin
          .from('push_log')
          .upsert(covered.map((d) => ({ item_id: d.item_id, due_date: d.next_due })), {
            onConflict: 'item_id,due_date',
            ignoreDuplicates: true,
          });
      }
    }
  }
  return { due: due.length, users: byUser.size, notifications };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    // Cron path
    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const cfg = await loadConfig();
      if (secret !== cfg.cron_secret) return json({ error: 'Unauthorized' }, 401);
      if (body.action !== 'run') return json({ error: 'Unknown action' }, 400);
      return json(await runAlerts(cfg));
    }

    // Signed-in user path
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401);
    const user = auth.user;

    const cfg = await loadConfig(user.email ?? undefined);

    if (body.action === 'public-key') return json({ publicKey: cfg.vapid_public });

    if (body.action === 'test') {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('user_id', user.id);
      if (!subs || subs.length === 0) return json({ sent: 0, error: 'This device is not subscribed yet.' });
      const sent = await sendAll(
        subs as Sub[],
        { title: 'Notifications are on', body: 'You will get an alert before each subscription charge.', url: 'subscriptions', tag: 'test' },
        cfg,
      );
      return json({ sent });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
