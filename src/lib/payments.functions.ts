import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
