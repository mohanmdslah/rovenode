import test from "node:test";
import assert from "node:assert/strict";
import { API_BASE_URL, ApiError, createApi, formatPriceWei, formatRoundedWei, formatWei, readWei } from "./api.js";

test("withdrawal list uses authenticated pagination and optional filters without losing wei precision", async () => {
  const data = { rows: [{ orderId: "WD-REMOTE", amount: "9007199254740993123456789", status: "REFUNDED" }], total: 21, page: 2, pageSize: 20 };
  const api = createApi(async (url, options) => {
    assert.equal(url, `${API_BASE_URL}/dividends/withdrawals?page=2&pageSize=20&status=REFUNDED&sourceType=MANUAL_CREDIT`);
    assert.equal(options.headers.Authorization, "Bearer session");
    return Response.json(data);
  });
  assert.deepEqual(await api.withdrawals("session", { page: 2, status: "REFUNDED", sourceType: "MANUAL_CREDIT" }), data);
  await assert.rejects(api.withdrawals(""), { status: 401 });
});

test("withdrawal list rejects invalid pagination and malformed amounts and propagates 401", async () => {
  const valid = { rows: [{ orderId: "WD-1", amount: "1", status: "PENDING" }], total: 1, page: 1, pageSize: 20 };
  for (const data of [{ ...valid, total: -1 }, { ...valid, pageSize: 0 }, { ...valid, rows: [{ ...valid.rows[0], amount: 1 }] }, { ...valid, rows: null }]) {
    await assert.rejects(createApi(async () => Response.json(data)).withdrawals("session"), ApiError);
  }
  await assert.rejects(createApi(async () => Response.json({ message: "Expired" }, { status: 401 })).withdrawals("session"), { status: 401 });
});

test("withdrawal list accepts the live legacy array response without inventing a total", async () => {
  for (const rows of [[], [{ orderId: "WD-LEGACY", amount: "1000000000000000000", status: "REFUNDED" }]]) {
    assert.deepEqual(await createApi(async () => Response.json(rows)).withdrawals("session", { page: 2 }), { rows, total: null, page: 2, pageSize: 20 });
  }
});

test("prices retain exact wei precision, including empty quotes", async () => {
  for (const lastPrice of [null, "0", "123456789012345678901234567890"]) {
    const api = createApi(async (url, options) => {
      assert.equal(url, `${API_BASE_URL}/price/current`);
      assert.equal(options.headers.Authorization, undefined);
      return Response.json({ lastPrice, initialPrice: "2500000000000" });
    });
    const price = await api.price();
    assert.equal(price.lastPrice, lastPrice === null ? null : BigInt(lastPrice));
    assert.equal(formatWei(price.initialPrice), "0.0000025");
  }
  assert.equal(formatWei("123456789012345678901234567890"), "123,456,789,012.34567890123456789");
  assert.equal(formatWei("1"), "0.000000000000000001");
  assert.equal(formatWei("0"), "0");
  assert.equal(formatWei(null), "—");
});

test("price API prefers BNB fields and display rounds to eight decimals", async () => {
  const api = createApi(async () => Response.json({ lastPriceBnb: "123456789012345678", initialPriceBnb: "2500000000000", lastPrice: "999" }));
  const price = await api.price();
  assert.equal(price.lastPrice, 123456789012345678n);
  assert.equal(formatPriceWei(price.lastPrice), "0.12345678");
  assert.equal(formatPriceWei(price.initialPrice), "0.0000025");
});

test("rounded token balances display exactly two decimal places without losing wei precision", () => {
  assert.equal(formatRoundedWei("121947012835478722505", "zh-CN", 2), "121.95");
  assert.equal(formatRoundedWei("1000000000000000000", "en", 2), "1.00");
  assert.equal(formatRoundedWei("1999999999999999999", "en", 2), "2.00");
});

test("private balance sends bearer auth and parses all amounts", async () => {
  const api = createApi(async (url, options) => {
    assert.equal(url, `${API_BASE_URL}/dividends/balance`);
    assert.equal(options.headers.Authorization, "Bearer test-session");
    assert.equal(options.cache, "no-store");
    return Response.json({ available: "0", pendingFreeze: "1000000000000000000", withdrawn: "9007199254740993123456789" });
  });
  assert.deepEqual(await api.dividends("test-session"), { available: 0n, pendingFreeze: 1000000000000000000n, withdrawn: 9007199254740993123456789n });
  await assert.rejects(api.dividends(""), { status: 401 });
});

test("auth requests preserve the documented body and authorization headers", async () => {
  const requests = [];
  const api = createApi(async (url, options) => { requests.push({ url, ...options }); return Response.json({ ok: true }); });
  await api.nonce("0xabc", 97);
  const body = { walletAddress: "0xabc", chainId: 97, nonce: "nonce", signature: "signature" };
  await api.login(body);
  await api.logout("test-session");
  assert.deepEqual(JSON.parse(requests[0].body), { walletAddress: "0xabc", chainId: 97 });
  assert.deepEqual(JSON.parse(requests[1].body), body);
  assert.equal(requests[2].headers.Authorization, "Bearer test-session");
  assert.ok(requests.every((request) => request.method === "POST"));
});

test("malformed balances and expired sessions are errors, never displayed as zero", async () => {
  for (const value of [null, 123, "-1", "1.5", "1e18", ""]) assert.throws(() => readWei(value), ApiError);
  const unauthorized = createApi(async () => Response.json({ message: "Expired" }, { status: 401 }));
  await assert.rejects(unauthorized.dividends("old"), { status: 401 });
  const invalid = createApi(async () => Response.json({ available: null, pendingFreeze: "0", withdrawn: "0" }));
  await assert.rejects(invalid.dividends("session"), ApiError);
});
