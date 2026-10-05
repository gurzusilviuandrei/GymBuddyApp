import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_PRICE_IDS = ["gymbuddy_pro_monthly"] as const;

// `environment` is accepted for older clients but ignored: the server decides it.
const envField = z.enum(["sandbox", "live"]).optional();

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ priceId: z.enum(ALLOWED_PRICE_IDS), environment: envField }).parse(data),
  )
  .handler(async ({ data }) => {
    const { gatewayFetch, getServerPaddleEnv } = await import("@/lib/paddle.server");
    const response = await gatewayFetch(getServerPaddleEnv(), `/prices?external_id=${encodeURIComponent(data.priceId)}`);
    const result = (await response.json()) as { data?: { id: string }[] };
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0]!.id;
  });

export const createCustomerPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ environment: envField }).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { getPaddleClient, getServerPaddleEnv } = await import("@/lib/paddle.server");
    const env = getServerPaddleEnv();
    const { data: row, error } = await context.supabase
      .from("users")
      .select("paddle_customer_id, paddle_subscription_id, subscription_environment")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load your subscription");
    if (!row?.paddle_customer_id || row.subscription_environment !== env) {
      throw new Error("No subscription found to manage");
    }
    const paddle = getPaddleClient(env);
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
