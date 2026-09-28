import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ priceId: z.string().min(1).max(64), environment: z.enum(["sandbox", "live"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { gatewayFetch } = await import("@/lib/paddle.server");
    const response = await gatewayFetch(data.environment, `/prices?external_id=${encodeURIComponent(data.priceId)}`);
    const result = (await response.json()) as { data?: { id: string }[] };
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0]!.id;
  });

export const createCustomerPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ environment: z.enum(["sandbox", "live"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("users")
      .select("paddle_customer_id, paddle_subscription_id, subscription_environment")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load your subscription");
    if (!row?.paddle_customer_id || row.subscription_environment !== data.environment) {
      throw new Error("No subscription found to manage");
    }
    const { getPaddleClient } = await import("@/lib/paddle.server");
    const paddle = getPaddleClient(data.environment);
    const session = await paddle.customerPortalSessions.create(
      row.paddle_customer_id,
      row.paddle_subscription_id ? [row.paddle_subscription_id] : [],
    );
    const sub = session.urls.subscriptions?.[0];
    return {
      overviewUrl: session.urls.general.overview,
      cancelUrl: sub?.cancelSubscription ?? null,
    };
  });
