import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./authContext";
import { authApi, adminApi } from "../frontApi";
import { sessionRole } from "../utils/sessionDomain";
import { getSubscriptionState } from "../utils/subscription";

// Authentication state backed by the API. The session itself lives in an
// HTTP-only cookie set by the backend; the frontend only keeps the user object.
export const AuthProvider = ({ children, domain }) => {
  const api = useMemo(() => authApi.forSession(domain), [domain]);
  const revision = useRef(0);
  const checkRole = useCallback((next) => {
    if (next && next.role !== sessionRole[domain]) throw new Error("Session role mismatch.");
    return next;
  }, [domain]);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // true once the session check finished
  const [users, setUsers] = useState([]); // admin only
  const isAdmin = user?.role === "admin";

  const refreshUser = useCallback(async () => {
    const version = ++revision.current;
    try {
      const next = checkRole(await api.getCurrentUser());
      if (version === revision.current) setUser(next);
      return next;
    } catch (error) {
      if (error.status === 401 && version === revision.current) setUser(null);
      throw error;
    } finally {
      if (version === revision.current) setReady(true);
    }
  }, [api, checkRole]);

  useEffect(() => {
    refreshUser().catch(() => {});
    const onFocus = () => refreshUser().catch(() => {});
    window.addEventListener("focus", onFocus);
    // Cancel pending checks when this role's provider unmounts.
    const cancel = () => { ++revision.current; };
    return () => { cancel(); window.removeEventListener("focus", onFocus); };
  }, [refreshUser]);

  const refreshUsers = useCallback(async () => {
    setUsers(await adminApi.getUsers());
  }, []);

  useEffect(() => {
    if (isAdmin) adminApi.getUsers().then(setUsers).catch(() => {});
  }, [isAdmin]);

  const login = useCallback(async (credentials) => {
    ++revision.current;
    const next = checkRole(await api.login(credentials));
    ++revision.current; // Ignore an older bootstrap/focus response arriving after login.
    setUser(next);
    setReady(true);
    return next;
  }, [api, checkRole]);

  const register = useCallback(async (details) => {
    ++revision.current;
    const next = checkRole(await api.register(details));
    ++revision.current;
    setUser(next);
    setReady(true);
    return next;
  }, [api, checkRole]);

  const logout = useCallback(async () => {
    ++revision.current;
    // Keep the session visible if the server couldn't clear its cookie.
    await api.logout();
    ++revision.current;
    setUser(null);
    setUsers([]);
    setReady(true);
  }, [api]);

  const updateProfile = useCallback(async (changes) => {
    const next = checkRole(await api.updateProfile(changes));
    setUser(next);
    return next;
  }, [api, checkRole]);
  const changePassword = useCallback((currentPassword, newPassword) => api.changePassword(currentPassword, newPassword), [api]);

  // Admin actions: the backend authorizes each one; the list is refreshed afterwards
  const admin = useMemo(() => {
    const run = async (request) => {
      const result = await request;
      await refreshUsers();
      return result;
    };
    return {
      updateUser: (id, changes) => run(adminApi.updateUser(id, changes)),
      setStatus: (id, status) => run(users.find((account) => account.id === id)?.role === "agent" ? adminApi.reviewAgentApplication(id, status === "suspended" ? "suspend" : "reactivate") : adminApi.setUserStatus(id, status)),
      deleteUser: (id) => run(adminApi.deleteUser(id)),
      changePlan: (id, planId) => run(adminApi.manageSubscription(id, "changePlan", { planId })),
      extendSubscription: (id, days) => run(adminApi.manageSubscription(id, "extend", { days })),
      cancelSubscription: (id) => run(adminApi.manageSubscription(id, "cancel")),
      activateSubscription: (id) => run(adminApi.manageSubscription(id, "activate")),
    };
  }, [refreshUsers, users]);

  const value = useMemo(
    () => ({
      domain,
      user,
      users,
      ready,
      isAuthenticated: Boolean(user),
      isAgent: user?.role === "agent",
      isAdmin,
      ...getSubscriptionState(user?.subscription),
      login,
      adminLogin: domain === "admin" ? login : undefined,
      register,
      logout,
      refreshUser,
      refreshUsers,
      updateProfile,
      changePassword,
      admin,
    }),
    [domain, user, users, ready, isAdmin, login, register, logout, refreshUser, refreshUsers, updateProfile, changePassword, admin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
