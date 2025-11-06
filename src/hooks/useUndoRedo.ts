import { useState, useCallback } from 'react';

/**
 * Undo/Redo functionality hook
 * Manages state history with past, present, and future states
 */
interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseUndoRedoReturn<T> {
  state: T;
  undo: () => void;
  redo: () => void;
  push: (newState: T) => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

export function useUndoRedo<T>(initialState: T): UseUndoRedoReturn<T> {
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current;

      const newPast = [...current.past];
      const newPresent = newPast.pop()!;

      return {
        past: newPast,
        present: newPresent,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current;

      const newFuture = [...current.future];
      const newPresent = newFuture.shift()!;

      return {
        past: [...current.past, current.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  const push = useCallback((newPresent: T) => {
    setState((current) => ({
      past: [...current.past, current.present],
      present: newPresent,
      future: [],
    }));
  }, []);

  const clear = useCallback(() => {
    setState({
      past: [],
      present: initialState,
      future: [],
    });
  }, [initialState]);

  return {
    state: state.present,
    undo,
    redo,
    push,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    clear,
  };
}
