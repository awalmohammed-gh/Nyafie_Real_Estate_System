import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformContext } from "./platformContext";
import { useAuth } from "./useAuth";
import { planApi, settingsApi, adminApi } from "../frontApi";
import { defaultSettings } from "../data/defaultSettings";
import { readStorage, writeStorage } from "../utils/storage";

// The last settings this browser saw, so a renamed site never flashes the default name on load
const SETTINGS_CACHE = "homebase:settings";

// Fills any section/key missing from older cached or saved values with the defaults
const withDefaults = (saved = {}) =>
  Object.fromEntries(Object.entries(defaultSettings).map(([section, defaults]) => [section, { ...defaults, ...(saved[section] || {}) }]));

// Plans, platform settings and (for admins) the payment ledger, loaded from the API
export const PlatformProvider = ({ children }) => {
  const { isAdmin, users, user } = useAuth();
  const viewerId = user?.id;
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [settings, setSettingsState] = useState(() => withDefaults(readStorage(SETTINGS_CACHE, {})));
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [payments, setPayments] = useState([]);

  const refreshPlans = useCallback(async () => {
    try {
      setPlans(await planApi.getPlans({ all: isAdmin }));
      setPlansError("");
    } catch (error) {
      setPlansError(error.message || "Plans could not be loaded.");
      throw error;
    } finally {
      setPlansLoading(false);
    }
    // Reloaded per signed-in account: providers also receive their own plan after it's retired
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, viewerId]);

  const refreshPayments = useCallback(async () => {
    setPayments(await adminApi.getSubscriptions());
  }, []);

  useEffect(() => {
    refreshPlans().catch(() => {});
  }, [refreshPlans]);

  const setSettings = useCallback((next) => {
    const full = withDefaults(next);
    setSettingsState(full);
    writeStorage(SETTINGS_CACHE, full);
  }, []);

  const reloadSettings = useCallback(async () => {
    setSettingsError("");
    try {
      setSettings(await settingsApi.getSettings());
    } catch (err) {
      setSettingsError(err.message || "Settings could not be loaded.");
    } finally {
      setSettingsReady(true);
    }
  }, [setSettings]);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

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

  const updateSettings = useCallback(
    async (section, values) => {
      setSettings(await adminApi.updateSettings(section, values));
    },
    [setSettings]
  );

  // Public list pages live at the slugs chosen in Admin Settings > SEO & URLs
  const paths = useMemo(
    () => ({ properties: `/${settings.slugs.properties}`, listings: `/${settings.slugs.listings}`, agents: `/${settings.slugs.agents}` }),
    [settings.slugs]
  );

  const value = useMemo(
    () => ({
      plans,
      plansLoading,
      plansError,
      settingsReady,
      settingsError,
      reloadSettings,
      siteName: settings.general.siteName,
      paths,
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
    [plans, plansLoading, plansError, settingsReady, settingsError, reloadSettings, paths, settings, payments, getPlan, savePlan, deletePlan, togglePlanActive, updateSettings, refreshPlans, refreshPayments]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
};
