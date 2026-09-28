import { resolvePaddlePrice } from "@/lib/payments.functions";

const clientToken = import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'] as string | undefined;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Paddle: any;
  }
}

export const PRO_PRICE_ID = "gymbuddy_pro_monthly";

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let initPromise: Promise<void> | null = null;

export function initializePaddle(onEvent?: (e: { name?: string }) => void) {
  if (!clientToken) return Promise.reject(new Error("Payments are not configured"));
  if (initPromise) return initPromise;
  initPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      window.Paddle.Environment.set(getPaddleEnvironment() === "sandbox" ? "sandbox" : "production");
      window.Paddle.Initialize({ token: clientToken, eventCallback: (e: { name?: string }) => onEvent?.(e) });
      resolve();
    };
    script.onerror = () => { initPromise = null; reject(new Error("Could not load checkout")); };
    document.head.appendChild(script);
  });
  return initPromise;
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({
    data: { priceId: priceId as "gymbuddy_pro_monthly", environment: getPaddleEnvironment() },
  });
}
