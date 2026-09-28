import { createFileRoute } from "@tanstack/react-router";
import type { PaddleEnv } from "@/lib/paddle.server";

// Paddle statuses that keep Pro access. past_due = Paddle is still retrying;
// once dunning fails Paddle cancels, which downgrades below.
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

type SubData = {
  id: string;
  status: string;
  customerId?: string;
  customData?: { userId?: string } | null;
  currentBillingPeriod?: { endsAt?: string } | null;
};

async function applySubscription(sub: SubData, env: PaddleEnv, forceStatus?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = forceStatus ?? sub.status;
  const patch = {
    subscription_tier: PRO_STATUSES.has(status) ? "pro" : "basic",
    subscription_status: status === "trialing" ? "trialling" : status === "canceled" ? "cancelled" : status,
    paddle_subscription_id: sub.id,
    paddle_customer_id: sub.customerId ?? null,
    subscription_environment: env,
    subscription_period_end: sub.currentBillingPeriod?.endsAt ?? null,
  };
  const userId = sub.customData?.userId;
  let q = supabaseAdmin.from("users").update(patch);
  // A downgrade from an older subscription must never override a newer one.
  if (patch.subscription_tier === "basic") q = q.or(`paddle_subscription_id.is.null,paddle_subscription_id.eq.${sub.id}`);
  const { error } = userId && /^[0-9a-f-]{36}$/i.test(userId)
    ? await q.eq("id", userId)
    : await q.eq("paddle_subscription_id", sub.id);
  if (error) throw new Error(`User update failed: ${error.message}`);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const envParam = new URL(request.url).searchParams.get("env");
        if (envParam !== "sandbox" && envParam !== "live") return new Response("Bad env", { status: 400 });
        const env: PaddleEnv = envParam;
        try {
          const { verifyWebhook, EventName } = await import("@/lib/paddle.server");
          const event = await verifyWebhook(request, env);
          switch (event.eventType) {
            case EventName.SubscriptionCreated:
            case EventName.SubscriptionUpdated:
              await applySubscription(event.data as unknown as SubData, env);
              break;
            case EventName.SubscriptionCanceled:
              await applySubscription(event.data as unknown as SubData, env, "canceled");
              break;
            default:
              break;
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
