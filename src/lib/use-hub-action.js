import { useEffect, useRef, useState } from "react";
import { hubErrorKey, nodeHub } from "./node-hub.js";

export function useHubAction(provider, account, token, onSettled) {
  const [status, setStatus] = useState({ phase: "idle" });
  const session = `${account}:${token}`;
  const currentSession = useRef(session);
  currentSession.current = session;
  const pending = useRef(null);
  useEffect(() => {
    setStatus({ phase: "idle" });
    return () => { pending.current?.abort(); pending.current = null; };
  }, [session]);

  async function execute(action, options = {}) {
    if (!provider?.request || !account || !token || pending.current) return;
    const attempt = new AbortController();
    let orderId;
    pending.current = attempt;
    const emit = (next) => {
      if (!attempt.signal.aborted && currentSession.current === session) setStatus({ action, session, orderId, ...next });
    };
    try {
      emit({ phase: "checking" });
      const args = options.prepare ? await options.prepare({ signal: attempt.signal, onStatus: emit }) : {};
      orderId = args.order?.orderId;
      await nodeHub.execute({ ...args, provider, account, action, signal: attempt.signal, onStatus: (next) => { options.onStatus?.(next); emit(next); } });
    } catch (error) {
      options.onError?.(error);
      emit({ phase: "error", error: hubErrorKey(error), detail: error.status && !error.code ? error.message : undefined, hash: error.transactionHash });
    } finally {
      if (pending.current === attempt) pending.current = null;
      if (!attempt.signal.aborted && currentSession.current === session) onSettled();
    }
  }
  const visible = status.session === session ? status : { phase: "idle" };
  return { status: visible, execute, busy: ["checking", "requesting", "signing", "pending"].includes(visible.phase) };
}
