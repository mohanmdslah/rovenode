import { ORDER_TERMINAL } from "./dividend-order.js";

export const WITHDRAWAL_PAGE_SIZE = 5;

export async function loadWithdrawalHistory({ api, store, account, token, page, signal }) {
  // Active orders on other pages/devices must still block duplicate withdrawals and LP exit.
  const [history, ...activePages] = await Promise.all([
    api.withdrawals(token, { page, pageSize: WITHDRAWAL_PAGE_SIZE }, signal),
    ...["PENDING", "SUBMITTED", "EXPIRED"].map((status) => api.withdrawals(token, { page: 1, pageSize: 20, status }, signal)),
  ]);
  const known = store.read(account);
  const cached = new Map(known.map((row) => [row.orderId, row]));
  const details = new Map();
  const remember = (order) => {
    const row = { ...order, hash: order.claimedTxHash || cached.get(order.orderId)?.hash || "" };
    details.set(row.orderId, row);
    store.save(account, row);
    return row;
  };
  activePages.forEach((result) => result.rows.forEach(remember));
  const rows = (history.total == null
    ? history.rows.slice((page - 1) * WITHDRAWAL_PAGE_SIZE, page * WITHDRAWAL_PAGE_SIZE)
    : history.rows
  ).map(remember);
  const unresolved = known.filter((row) => !ORDER_TERMINAL.has(row.status) && !details.has(row.orderId));
  for (let index = 0; index < unresolved.length; index += 5) {
    await Promise.all(unresolved.slice(index, index + 5).map(async (cachedOrder) => {
      try { remember(await api.withdrawalOrder(token, cachedOrder.orderId, signal)); }
      catch (error) {
        if (error.status === 401 || signal?.aborted) throw error;
        details.set(cachedOrder.orderId, { ...cachedOrder, loadError: true });
      }
    }));
  }
  return { ...history, rows, details: [...details.values()], active: [...details.values()].filter((row) => !ORDER_TERMINAL.has(row.status)) };
}
