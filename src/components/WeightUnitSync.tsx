import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWeightUnit } from "@/lib/gym-api";
import { rememberWeightUnit } from "@/lib/use-weight-unit";

/**
 * Keeps the phone's copy of the member's weight unit in step with the server, so a unit chosen on
 * another phone shows up here. Offline it does nothing and the saved copy keeps working.
 */
export function WeightUnitSync() {
  const { data } = useQuery({ queryKey: ["weight-unit"], queryFn: getWeightUnit, retry: 1 });
  useEffect(() => {
    if (data) rememberWeightUnit(data);
  }, [data]);
  return null;
}
