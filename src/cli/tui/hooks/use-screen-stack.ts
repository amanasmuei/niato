import { useCallback, useState } from "react";

export interface Screen {
  name: string;
  props: Record<string, unknown>;
}

export interface ScreenStack {
  current: Screen;
  depth: number;
  push: (name: string, props?: Record<string, unknown>) => void;
  pop: () => void;
  replace: (name: string, props?: Record<string, unknown>) => void;
}

export function useScreenStack(initial: Screen): ScreenStack {
  const [stack, setStack] = useState<Screen[]>([initial]);

  const push = useCallback(
    (name: string, props: Record<string, unknown> = {}): void => {
      setStack((s) => [...s, { name, props }]);
    },
    [],
  );

  const pop = useCallback((): void => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback(
    (name: string, props: Record<string, unknown> = {}): void => {
      setStack((s) => [...s.slice(0, -1), { name, props }]);
    },
    [],
  );

  // Invariant: `stack` is initialized non-empty and `pop` refuses to drop
  // below length 1, so the top is always defined. We runtime-check here
  // instead of using a non-null assertion (forbidden by project ESLint
  // under strict-type-checked + noUncheckedIndexedAccess).
  const current = stack[stack.length - 1];
  if (current === undefined) {
    throw new Error("useScreenStack invariant: stack is empty");
  }

  return {
    current,
    depth: stack.length,
    push,
    pop,
    replace,
  };
}
