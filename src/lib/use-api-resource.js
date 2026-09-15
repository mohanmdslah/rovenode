import { useEffect, useState } from "react";

export function useApiResource(load, enabled, refreshKey, onError, intervalMs = 30000) {
  const [state, setState] = useState({ data: null, status: "idle" });
  useEffect(() => {
    let active = true;
    let pending = false;
    let controller;
    setState({ data: null, status: enabled ? "loading" : "idle", load });
    if (!enabled) return undefined;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      controller = new AbortController();
      try {
        const data = await load(controller.signal);
        if (active) setState({ data, status: "ready", load });
      } catch (error) {
        if (active) {
          setState({ data: null, status: "error", load });
          onError?.(error);
        }
      } finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, enabled, refreshKey, onError, intervalMs]);
  return state.load === load && enabled ? state : { data: null, status: enabled ? "loading" : "idle" };
}
