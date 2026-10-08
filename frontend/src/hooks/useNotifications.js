import { useMemo, useSyncExternalStore } from "react";
import { notificationApi } from "../frontApi";
import { useAuth } from "../context/useAuth";

const POLL_MS = 30000;
const EMPTY = { items: [], unread: 0, loaded: false, error: "" };

/**
 * One store per signed-in account, shared by every bell on screen (the navbar renders a desktop
 * and a mobile bell), so there is one poll and every badge updates together.
 * Changes apply immediately; `version` makes a poll that started before a change ignore its result.
 */
const createStore = () => {
  let state = EMPTY;
  let version = 0;
  let timer;
  const listeners = new Set();
  const set = (next) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const load = async () => {
    const started = version;
    try {
      const data = await notificationApi.getNotifications();
      if (started === version) set({ ...data, loaded: true, error: "" });
    } catch (err) {
      if (started === version) set({ error: err.message || "Unable to load notifications" });
    }
  };
  // Optimistic change, then the server's own list and count; on failure the previous list returns
  const change = async (optimistic, request) => {
    const previous = state;
    version++;
    set(optimistic(state));
    try {
      const data = await request();
      version++;
      if (data?.items) set({ items: data.items, unread: data.unread });
      return data;
    } catch (err) {
      version++;
      set({ items: previous.items, unread: previous.unread });
      throw err;
    }
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        load();
        timer = setInterval(load, POLL_MS);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) clearInterval(timer);
      };
    },
    load,
    change,
  };
};

const stores = new Map();
const storeFor = (key) => {
  if (!stores.has(key)) stores.set(key, createStore());
  return stores.get(key);
};

const without = (ids) => (state) => {
  const removed = state.items.filter((item) => ids.has(item.id));
  return { items: state.items.filter((item) => !ids.has(item.id)), unread: Math.max(0, state.unread - removed.filter((item) => !item.read).length) };
};
const markRead = (ids) => (state) => ({
  items: state.items.map((item) => (ids.has(item.id) ? { ...item, read: true } : item)),
  unread: Math.max(0, state.unread - state.items.filter((item) => ids.has(item.id) && !item.read).length),
});

// The signed-in account's notifications and every action on them (the server checks ownership)
export const useNotifications = () => {
  const { user } = useAuth();
  const store = storeFor(user ? `${user.role}:${user.id}` : "signed-out");
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  const actions = useMemo(() => ({
    reload: store.load,
    markRead: (id) => store.change(markRead(new Set([id])), () => notificationApi.markNotificationRead(id)),
    markAllRead: () => store.change((state) => ({ items: state.items.map((item) => ({ ...item, read: true })), unread: 0 }), () => notificationApi.markAllNotificationsRead()),
    markSelectedRead: (ids) => store.change(markRead(new Set(ids)), () => notificationApi.markNotificationsRead(ids)),
    remove: (ids) => store.change(without(new Set(ids)), () => (ids.length === 1 ? notificationApi.deleteNotification(ids[0]) : notificationApi.deleteNotifications(ids))),
    removeAll: () => store.change(() => ({ items: [], unread: 0 }), () => notificationApi.deleteAllNotifications()),
  }), [store]);

  return { ...state, ...actions };
};
