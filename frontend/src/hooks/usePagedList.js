import { useCallback, useEffect, useState } from "react";
import { useApiQuery } from "./useApiQuery";
import { startPolling } from "../utils/poll";
import { ADMIN_COUNTS_CHANGED } from "../utils/adminCounts";

// The value once it has stopped changing (a search box, after typing pauses)
export const useDebounced = (value, ms = 300) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
};

/**
 * One page of a list the server filters, searches and sorts. `params` are the filters; changing any of
 * them starts again from the first page. `request(params)` resolves to { items, total, page, pages, limit, ... }.
 * The page on screen is refreshed every minute (`every`) while the tab is visible, and by reload() after a change.
 * Pass `paging` to DataTable (or Pager).
 */
export const usePagedList = (name, params, request, { every = 60000 } = {}) => {
  const filterKey = JSON.stringify(params);
  const [at, setAt] = useState({ filterKey, page: 1 });
  const page = at.filterKey === filterKey ? at.page : 1;
  const setPage = useCallback((next) => setAt({ filterKey, page: next }), [filterKey]);

  // The last row of the last page was removed: show the page that is now the last
  const query = useApiQuery(`${name}:${page}:${filterKey}`, async () => {
    const result = await request({ ...params, page });
    return result.page > result.pages ? request({ ...params, page: result.pages }) : result;
  });
  const data = query.data ?? query.previous ?? query.last;
  const { reload } = query;
  useEffect(() => startPolling(reload, every), [reload, every]);

  return {
    data,
    error: query.error,
    reload,
    paging: data && { page: data.page, pages: data.pages, total: data.total, pageSize: data.limit, onChange: setPage },
  };
};

// The record opened from a list. It stays open when a change moves it to another tab or page.
// Returns [record | null, open(record | null)]; call open(updated) after changing it.
export const useOpenRecord = (rows) => {
  const [kept, setKept] = useState(null);
  return [kept && (rows.find((row) => row.id === kept.id) || kept), setKept];
};

// Runs after any admin action (dialogs that change an account, a plan...), to reload what is on screen
export const useAdminChange = (onChange) => {
  useEffect(() => {
    window.addEventListener(ADMIN_COUNTS_CHANGED, onChange);
    return () => window.removeEventListener(ADMIN_COUNTS_CHANGED, onChange);
  }, [onChange]);
};
