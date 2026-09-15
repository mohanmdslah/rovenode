// Set VITE_API_BASE_URL to the ROVE backend when it is ready. The legacy host
// remains the default so the current node/dividend integration keeps working.
const configuredApiBase = import.meta.env?.VITE_API_BASE_URL;
export const API_BASE_URL = (configuredApiBase || "https://api.labdog.top/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export function readWei(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new ApiError("Invalid amount response");
  return BigInt(value);
}

export function formatWei(value, locale = "en", digits = 18) {
  if (value == null) return "—";
  const wei = typeof value === "bigint" ? value : readWei(value);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  return whole.toLocaleString(locale) + (fraction ? decimal + fraction : "");
}

export function formatRoundedWei(value, locale = "en", digits = 2) {
  if (value == null) return "—";
  const wei = typeof value === "bigint" ? value : readWei(value);
  const scale = 10n ** 18n;
  const decimalScale = 10n ** BigInt(digits);
  const rounded = (wei * decimalScale + scale / 2n) / scale;
  const whole = rounded / decimalScale;
  const fraction = (rounded % decimalScale).toString().padStart(digits, "0");
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  return whole.toLocaleString(locale) + (digits ? decimal + fraction : "");
}

export function formatPriceWei(value, locale = "en") {
  return formatWei(value, locale, 8);
}

export function createApi(fetcher = globalThis.fetch) {
  async function request(path, { method = "GET", body, token, signal } = {}) {
    const timeout = AbortSignal.timeout(15000);
    const response = await fetcher(`${API_BASE_URL}${path}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: "omit",
      cache: "no-store",
    });
    let data;
    try { data = await response.json(); } catch { throw new ApiError("Invalid API response", response.status); }
    if (!response.ok) throw new ApiError(typeof data?.message === "string" ? data.message : "API request failed", response.status);
    return data;
  }
  return {
    nonce: (walletAddress, chainId, signal) => request("/auth/nonce", { method: "POST", body: { walletAddress, chainId }, signal }),
    login: (body, signal) => request("/auth/login", { method: "POST", body, signal }),
    logout: (token) => request("/auth/logout", { method: "POST", token }),
    async requestWithdrawal(token, amount) {
      if (!token) throw new ApiError("Login required", 401);
      readWei(amount);
      const data = await request("/dividends/withdrawal-requests", { method: "POST", body: { amount }, token });
      if (!data?.order || typeof data.order.orderId !== "string" || !data.order.orderId) throw new ApiError("Invalid withdrawal order");
      return data.order;
    },
    async withdrawalOrder(token, orderId, signal) {
      if (!token) throw new ApiError("Login required", 401);
      const data = await request(`/dividends/withdrawal-orders/${encodeURIComponent(orderId)}`, { token, signal });
      if (!data || data.orderId !== orderId || typeof data.status !== "string") throw new ApiError("Invalid order detail");
      return data;
    },
    async withdrawals(token, { page = 1, pageSize = 20, status, sourceType } = {}, signal) {
      if (!token) throw new ApiError("Login required", 401);
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) query.set("status", status);
      if (sourceType) query.set("sourceType", sourceType);
      const response = await request(`/dividends/withdrawals?${query}`, { token, signal });
      const legacy = Array.isArray(response);
      const data = legacy ? { rows: response, total: null, page, pageSize } : response;
      if (!Array.isArray(data?.rows) || (!legacy && (!Number.isSafeInteger(data.total) || data.total < 0)) || !Number.isSafeInteger(data.page) || data.page < 1 || !Number.isSafeInteger(data.pageSize) || data.pageSize < 1) throw new ApiError("Invalid withdrawal history");
      for (const row of data.rows) {
        if (!row || typeof row.orderId !== "string" || !row.orderId || typeof row.status !== "string") throw new ApiError("Invalid withdrawal history");
        readWei(row.amount);
      }
      return data;
    },
    async dividendHistory(token, page = 1, signal, pageSize = 20) {
      if (!token) throw new ApiError("Login required", 401);
      const data = await request(`/dividends/history?page=${page}&pageSize=${pageSize}`, { token, signal });
      const rows = Array.isArray(data) ? data : data?.rows;
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new ApiError("Invalid dividend history");
      if (Array.isArray(data)) return { rows: data, total: null, page, pageSize };
      if (!Number.isSafeInteger(data.total) || data.total < 0) throw new ApiError("Invalid dividend history");
      return data;
    },
    async price(signal) {
      const data = await request("/price/current", { signal });
      const lastPriceValue = data.lastPriceBnb ?? data.lastPrice;
      const initialPriceValue = data.initialPriceBnb ?? data.initialPrice;
      return { lastPrice: lastPriceValue == null ? null : readWei(lastPriceValue), initialPrice: initialPriceValue == null ? null : readWei(initialPriceValue), observedAt: data.observedAt };
    },
    async dividends(token, signal) {
      if (!token) throw new ApiError("Login required", 401);
      const data = await request("/dividends/balance", { token, signal });
      return { available: readWei(data.available), pendingFreeze: readWei(data.pendingFreeze), withdrawn: readWei(data.withdrawn) };
    },
    async nodes(account, signal) {
      const data = await request(`/nodes/${account.toLowerCase()}`, { signal });
      if (!Array.isArray(data)) throw new ApiError("Invalid node response");
      return data;
    },
  };
}

export const api = createApi();
