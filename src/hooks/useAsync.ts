import { useState, useEffect, useCallback } from 'react';

/**
 * Handle async operations with loading, error, and success states
 */
type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

interface UseAsyncReturn<T, E> {
  execute: () => Promise<T>;
  status: AsyncStatus;
  value: T | null;
  error: E | null;
}

export function useAsync<T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate = true
): UseAsyncReturn<T, E> {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<E | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setValue(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setValue(response);
      setStatus('success');
      return response;
    } catch (err) {
      setError(err as E);
      setStatus('error');
      throw err;
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (!immediate) return;

    let isMounted = true;

    execute().catch((err) => {
      if (!isMounted) return;
      console.error('Async error:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [execute, immediate]);

  return { execute, status, value, error };
}
