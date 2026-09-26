import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformContext } from "./platformContext";
import { useAuth } from "./useAuth";
import { planApi, settingsApi, adminApi } from "../frontApi";
import { defaultSettings } from "../data/defaultSettings";

// Plans, platform settings and (for admins) the payment ledger, loaded from the API
export const PlatformProvider = ({ children }) => {
  const { isAdmin, users } = useAuth();
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [payments, setPayments] = useState([]);

  const refreshPlans = useCallback(async () => {
    try {
      setPlans(await planApi.getPlans({ all: isAdmin }));
    } finally {
      setPlansLoading(false);
    }
  }, [isAdmin]);

  const refreshPayments = useCallback(async () => {
    setPayments(await adminApi.getSubscriptions());
  }, []);

  useEffect(() => {
    refreshPlans().catch(() => {});
  }, [refreshPlans]);

  useEffect(() => {
    settingsApi
      .getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setSettingsReady(true));
  }, []);

  // Reload the payment ledger when admins change subscriptions (the user list refreshes)
  useEffect(() => {
    if (isAdmin) adminApi.getSubscriptions().then(setPayments).catch(() => {});
  }, [isAdmin, users]);

  const getPlan = useCallback((id) => plans.find((p) => p.id === id) || null, [plans]);

  const savePlan = useCallback(
    async (plan) => {
      const saved = plan.id && plans.some((p) => p.id === plan.id) ? await planApi.updatePlan(plan.id, plan) : await planApi.createPlan(plan);
      await refreshPlans();
      return saved;
    },
    [plans, refreshPlans]
  );

  const deletePlan = useCallback(
    async (id) => {
      await planApi.deletePlan(id);
      await refreshPlans();
    },
    [refreshPlans]
  );

  const togglePlanActive = useCallback(
    async (id) => {
      const plan = plans.find((p) => p.id === id);
      await planApi.updatePlan(id, { ...plan, active: !plan.active });
      await refreshPlans();
    },
    [plans, refreshPlans]
  );

  const updateSettings = useCallback(async (section, values) => {
    setSettings(await adminApi.updateSettings(section, values));
  }, []);

  const value = useMemo(
    () => ({
      plans,
      plansLoading,
      settingsReady,
      activePlans: plans.filter((p) => p.active),
      settings,
      payments,
      getPlan,
      savePlan,
      deletePlan,
      togglePlanActive,
      updateSettings,
      refreshPlans,
      refreshPayments,
    }),
    [plans, plansLoading, settingsReady, settings, payments, getPlan, savePlan, deletePlan, togglePlanActive, updateSettings, refreshPlans, refreshPayments]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
};
