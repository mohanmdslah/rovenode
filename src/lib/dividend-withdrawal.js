import { api } from "./api.js";
import { assertHubWallet, nodeHub } from "./node-hub.js";
import { readWei } from "./api.js";

const fail = (code) => Object.assign(new Error(code), { code });

export async function prepareDividendWithdrawal({ provider, account, token, amount, orderId, signal, onStatus, onOrder, apiClient = api, hub = nodeHub }) {
  await assertHubWallet(provider, account, signal);
  let order;
  if (orderId) {
    order = await apiClient.withdrawalOrder(token, orderId, signal);
    if (order.status !== "PENDING" || order.claimedTxHash) throw fail("ORDER_NOT_PENDING");
  } else {
    if (typeof amount !== "bigint" || amount <= 0n) throw fail("INVALID_ORDER");
    const balance = await apiClient.dividends(token, signal);
    if (balance.available < amount) throw fail("BALANCE_CHANGED");
    if (balance.pendingFreeze > 0n) throw fail("ORDER_IN_PROGRESS");
    await assertHubWallet(provider, account, signal);
    onStatus({ phase: "requesting" });
    // Do not abort a submitted mutation: capture its order ID even if the account changes.
    try { order = await apiClient.requestWithdrawal(token, amount.toString()); }
    catch (error) {
      if (!error.status) error.code = "REQUEST_UNCERTAIN";
      throw error;
    }
  }
  onOrder(order);
  await assertHubWallet(provider, account, signal);
  const expectedAmount = amount ?? readWei(order.amount);
  return { order, expectedAmount };
}
