import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { createWithdrawalOrderStore } from "./dividend-order.js";
import { useApiResource } from "./use-api-resource.js";
import { loadWithdrawalHistory } from "./withdrawal-history.js";

export function useDividendOrders({ account, token, refreshKey, onUnauthorized, onChange }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const store = useMemo(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* Session-only receipt tracking remains available. */ }
    return createWithdrawalOrderStore(storage);
  }, []);
  const currentSession = useRef("");
  const lastStatus = useRef("");
  currentSession.current = `${account}:${token}`;
  const authError = useCallback((error) => { if (error.status === 401) onUnauthorized(token); }, [token, onUnauthorized]);
  const load = useCallback((signal) => loadWithdrawalHistory({ api, store, account, token, page, signal }), [account, token, page, revision, store]);
  const resource = useApiResource(load, Boolean(account && token), refreshKey, authError, 8000);
  const statusKey = resource.data ? JSON.stringify([...resource.data.rows, ...resource.data.active].map((row) => [row.orderId, row.status, row.claimedTxHash])) : "";
  useEffect(() => {
    const fingerprint = `${account}:${token}:${statusKey}`;
    if (statusKey && fingerprint !== lastStatus.current) { lastStatus.current = fingerprint; onChange(); }
  }, [account, token, statusKey, onChange]);
  useEffect(() => { setPage(1); setStorageWarning(false); }, [account, token]);
  useEffect(() => {
    const listener = (event) => { if (event.key?.startsWith("rove:56:dividend-orders:")) setRevision((value) => value + 1); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  const save = (order, owner = account) => {
    const persisted = store.save(owner, order);
    if (owner === account && currentSession.current === `${account}:${token}`) {
      if (!persisted) setStorageWarning(true);
      setRevision((value) => value + 1);
    }
  };
  return { ...resource, page, setPage, save, storageWarning };
}
