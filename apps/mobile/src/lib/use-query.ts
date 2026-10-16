import { useCallback, useEffect, useRef, useState } from 'react';

export interface Query<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
  /** Pull-to-refresh: shows the refresh spinner. */
  refresh: () => void;
  /** Background update (polling, returning to a screen): no spinner. */
  refetch: () => void;
}

type Mode = 'load' | 'pull' | 'silent';

/** Minimal data hook: load on mount and when `key` changes, pull-to-refresh, ignore stale responses. */
export function useQuery<T>(key: string, load: () => Promise<T>): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const run = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const fetchNow = useCallback((mode: Mode) => {
    const id = ++run.current;
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'load') setLoading(true);
    loader
      .current()
      .then((value) => {
        if (id !== run.current) return;
        setData(value);
        setError(null);
      })
      .catch((reason: unknown) => id === run.current && setError(reason))
      .finally(() => {
        if (id !== run.current) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => fetchNow('load'), [key, fetchNow]);
  return { data, error, loading, refreshing, refresh: () => fetchNow('pull'), refetch: () => fetchNow('silent') };
}
