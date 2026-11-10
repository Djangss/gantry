import { useSyncExternalStore } from "react";

const root = () => document.documentElement;

// subscribeDark calls cb whenever the .dark class on <html> flips (see main.tsx).
export function subscribeDark(cb: () => void) {
  const o = new MutationObserver(cb);
  o.observe(root(), { attributes: true, attributeFilter: ["class"] });
  return () => o.disconnect();
}

export const useDark = () => useSyncExternalStore(subscribeDark, () => root().classList.contains("dark"));
