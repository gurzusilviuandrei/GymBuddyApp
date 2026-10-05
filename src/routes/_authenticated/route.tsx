import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { OfflineSyncWorker } from "@/components/OfflineSyncWorker";
import { claimDeviceData } from "@/lib/device-owner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    // Fast path: the locally stored session avoids a network round-trip on every
    // in-app navigation. The database still checks the token on every request.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? (await supabase.auth.getUser()).data.user;
    if (!user) throw redirect({ to: "/auth" });
    // Another account's data on this phone is erased before any screen can show it.
    if (claimDeviceData(user.id)) context.queryClient.clear();
    return { user };
  },
  component: () => (
    <>
      <OfflineSyncWorker />
      <Outlet />
    </>
  ),
});
