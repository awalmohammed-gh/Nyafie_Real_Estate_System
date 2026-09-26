import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContext";
import { authApi, adminApi } from "../frontApi";
import { getSubscriptionState } from "../utils/subscription";

// Authentication state backed by the API. The session itself lives in an
// HTTP-only cookie set by the backend; the frontend only keeps the user object.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // true once the session check finished
  const [users, setUsers] = useState([]); // admin only
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const refreshUser = useCallback(async () => {
    const next = await authApi.getCurrentUser();
    setUser(next);
    return next;
  }, []);

  const refreshUsers = useCallback(async () => {
    setUsers(await adminApi.getUsers());
  }, []);

  useEffect(() => {
    if (isAdmin) adminApi.getUsers().then(setUsers).catch(() => {});
  }, [isAdmin]);

  const login = useCallback(async ({ email, password }) => {
    const next = await authApi.loginUser({ email, password });
    setUser(next);
    return next;
  }, []);

  const adminLogin = useCallback(async ({ email, password }) => {
    const next = await authApi.loginAdmin({ email, password });
    setUser(next);
    return next;
  }, []);

  const register = useCallback(async ({ firstName, lastName, email, phone = "", password }) => {
    const next = await authApi.registerUser({ firstName, lastName, email, phone, password });
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logoutUser().catch(() => {});
    setUser(null);
    setUsers([]);
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const next = await authApi.updateProfile(changes);
    setUser(next);
    return next;
  }, []);

  const changePassword = useCallback((currentPassword, newPassword) => authApi.changePassword(currentPassword, newPassword), []);

  // Admin actions: the backend authorizes each one; the list is refreshed afterwards
  const admin = useMemo(() => {
    const run = async (request) => {
      const result = await request;
      await refreshUsers();
      return result;
    };
    return {
      updateUser: (id, changes) => run(adminApi.updateUser(id, changes)),
      setStatus: (id, status) => run(adminApi.setUserStatus(id, status)),
      deleteUser: (id) => run(adminApi.deleteUser(id)),
      changePlan: (id, planId) => run(adminApi.manageSubscription(id, "changePlan", { planId })),
      extendSubscription: (id, days) => run(adminApi.manageSubscription(id, "extend", { days })),
      cancelSubscription: (id) => run(adminApi.manageSubscription(id, "cancel")),
      activateSubscription: (id) => run(adminApi.manageSubscription(id, "activate")),
    };
  }, [refreshUsers]);

  const value = useMemo(
    () => ({
      user,
      users,
      ready,
      isAuthenticated: Boolean(user),
      isAgent: user?.role === "agent",
      isAdmin,
      ...getSubscriptionState(user?.subscription),
      login,
      adminLogin,
      register,
      logout,
      refreshUser,
      refreshUsers,
      updateProfile,
      changePassword,
      admin,
    }),
    [user, users, ready, isAdmin, login, adminLogin, register, logout, refreshUser, refreshUsers, updateProfile, changePassword, admin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
