import { useCallback } from "react";
import { useToast } from "../context/useToast";

/**
 * Runs an API action and reports the outcome with the existing toast system:
 * the success toast only appears once the server confirms, and failures show
 * the server's message (e.g. "Property limit reached. Please upgrade your plan.").
 *
 *   const run = useAsyncAction();
 *   await run(admin.setStatus(id, "active"), { success: "User activated" });
 */
export const useAsyncAction = () => {
  const { toast } = useToast();
  return useCallback(
    async (request, { success, description, type = "success" } = {}) => {
      try {
        const result = await request;
        if (success) toast({ title: success, description, type });
        return { ok: true, result };
      } catch (error) {
        toast({ type: "error", title: error.message || "Something went wrong. Please try again." });
        return { ok: false, error };
      }
    },
    [toast]
  );
};
