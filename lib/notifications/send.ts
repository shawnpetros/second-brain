import webpush from "web-push";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

function sql() {
  return neon(env.DATABASE_URL);
}

// VAPID keys must be set in environment
function initVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn("VAPID keys not configured — push notifications disabled");
    return false;
  }

  webpush.setVapidDetails(
    "mailto:shawn@petrosindustries.com",
    publicKey,
    privateKey
  );
  return true;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushNotification(
  payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!initVapid()) return { sent: 0, failed: 0 };

  // Get all active subscriptions
  const rows = await sql()`
    SELECT id, subscription FROM push_subscriptions WHERE active = true
  `;

  if (!rows.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const subscription = row.subscription as webpush.PushSubscription;
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired or invalid — deactivate
        await sql()`
          UPDATE push_subscriptions SET active = false WHERE id = ${row.id}
        `;
      }
      failed++;
    }
  }

  return { sent, failed };
}

export async function saveSubscription(
  userEmail: string,
  subscription: webpush.PushSubscription
): Promise<string> {
  const rows = await sql()`
    INSERT INTO push_subscriptions (user_email, subscription)
    VALUES (${userEmail}, ${JSON.stringify(subscription)})
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function removeSubscription(
  endpoint: string
): Promise<boolean> {
  const rows = await sql()`
    UPDATE push_subscriptions SET active = false
    WHERE subscription->>'endpoint' = ${endpoint}
    RETURNING id
  `;
  return rows.length > 0;
}
