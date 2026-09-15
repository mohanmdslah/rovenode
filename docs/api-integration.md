# BSC Testnet API integration

Source: the supplied API_FRONTEND.md (2026-09-07). API base: `https://api.labdog.top/api`.

## Network

- Chain: BSC Testnet, `97` / `0x61`.
- Hub: `0x1395df45f8afafb43e755d6fcccec52201d28888`.
- LABDOG: `0x1b9ebc101eab01f9b92ad30f9fc0ab6d7b3a8888`.
- Pair: `0x88b512320508dca4e9c46128e9bb5ceb6e04099c`.
- Test USDT from the supplied contract registry: `0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684`, 18 decimals. This supersedes the previously searched public test token reference. Node deposit integration remains disabled.

Wallet chain switching uses the injected EIP-1193 provider. The RPC URL in network.js is only an add-chain fallback configuration.

## Authentication and reads

1. Request accounts and ensure chain 97.
2. POST `/auth/nonce` with lowercase walletAddress and chainId.
3. Sign using `personal_sign`, with the user-approved compatibility rule below.
4. POST `/auth/login` with walletAddress, chainId, nonce and signature.
5. Keep the JWT in memory; send it as Bearer authorization to private reads. Revalidate account and chain around each asynchronous login step.
6. Clear the session on account/network changes, disconnect or HTTP 401. Logout also calls `/auth/logout` and attempts to revoke wallet permissions.

The node center polls `/price/current`, authenticated `/dividends/balance` and injected-wallet Hub reads every 30 seconds while the document is visible. Its refresh button immediately reloads them. Old account responses are discarded. The purchase section retains its read-only `/nodes/:walletAddress` status check.

Backend compatibility (confirmed 2026-09-07): the nonce endpoint returns a checksum-cased address in its `Wallet:` line, but login verifies the same message with a lowercase address. Signing the original message returns HTTP 401 even when ethers locally recovers the correct account. The user approved lowercasing only the matching wallet address in that line before signing. Nonce, chain ID, whitespace and all other text are preserved. Remove this compatibility rule when the backend makes the returned and verified message identical.

- Opening and current prices: `initialPriceBnb` and `lastPriceBnb`, BNB wei (18 decimals). The client temporarily falls back to `initialPrice`/`lastPrice` for compatibility. Zero/null current price displays no valid quote. UI prices are formatted to a maximum of 8 decimal places.
- Fee balance: `available`; also display `pendingFreeze` and `withdrawn`, LABDOG wei.
- Amount parsing and formatting use BigInt and strings, including large balances and sub-token precision.

## Scope

Node deposits are explicitly excluded for this release. The deposit contract and deposit USDT constants are empty; the UI and default contract client prevent transactions. Do not assign the LABDOG token address to the deposit client.

Locked/claimable assets, locked claims, LP exits, dividend withdrawal and both history views are integrated as described below. The API's dividend claim process uses a signed withdrawal order plus Hub.claimDividend; the former placeholder manager ABI must not be used for that flow. Dividend settlement history is not a substitute for withdrawal history. The different example dividend URL in FRONTEND_API.md does not replace the previously configured backend domain.

## Hub assets and transactions

ABI sources are the supplied LabdogNodeHub.json and LabdogToken.json, preserved under src/contracts. testnet.json contains only the bscTestnet section of the supplied address registry. No DEX swap or Router integration is needed for claimLocked/removeLP.

| Display | Contract source |
| --- | --- |
| Node identity | Hub.nodeOf(account); getNode.status (0 active / 1 exited) |
| Total locked allocation | getNode.lockedTotal, a historical total rather than a calculated remaining balance |
| Claimable now | Hub.claimableLocked(account) |
| Total unlocked / claimed | Hub.unlockedLocked(account) / getNode.claimed |
| Active node LP share | getNode.lpRegistered, displayed as zero after exit/removal |
| LP registration / custody detail | getNode.lpRegistered / getNode.lpCustodied, without implying these are wallet-held LP tokens |
| Wallet LABDOG | Token.balanceOf(account) |

Each refresh uses a single block number for all view calls. A non-node avoids getNode, which can revert. Reads and writes validate the active injected wallet and chain 97; account/session changes discard pending UI results.

Both actions preflight fresh contract state and staticCall before sending a zero-argument transaction. Claims require a positive claimable amount. Exit requires an active node with removable LP and custody at least 50% of registration. The UI requires explicit confirmation of permanent exit and forfeiture of all unclaimed rights. Buttons are unavailable while either action is pending. No token approval or manually entered amount is used.

Success requires receipt status 1 plus the appropriate Hub event for the connected wallet (LockedTokensClaimed or NodeExited). A fee-bumped replacement can succeed; a cancelled/replaced action cannot. Confirmation transport failures retain the hash and instruct the user to inspect the transaction. The page refreshes assets and API balances after an attempt settles; exited nodes lose their claim/exit buttons. Receipt links are scoped to the current authenticated UI session.

## Verification

Run `npm test` for amount handling, API requests, network switching, signing, rejected signatures, superseded logins, logout and session expiration. Run `npm run build` for the production bundle. Browser verification should include disconnected/live-price states, wallet sign-in, account switching, and narrow mobile widths. Automated wallet fixtures do not replace testing in an installed wallet extension.

Verified on 2026-09-07: 44 automated tests pass and the production build succeeds. An ephemeral test wallet exercised the actual nonce, compatible signature login, dividends/balance and logout endpoints successfully; no chain transaction was submitted. The current price endpoint returned lastPrice=0 and initialPrice=2500000000000 (0.0000025 USDT). Browser checks at 1280px and 320px confirmed live price display, unavailable asset actions, missing-wallet feedback and no horizontal overflow. An installed wallet extension was not available in the preview browser.

Hub integration verification (same date): 54 tests pass, including ABI transport through a mock injected EIP-1193 provider, consistent-block reads, full-amount calls, preflight guards, account/network changes, receipt/event checks, transaction replacements and lost confirmation responses. The production build succeeds with a size advisory for the expanded ethers/ABI bundle. The isolated qa/node-hub.html fixture verifies claim refresh, irreversible-exit confirmation, exited state, hidden action buttons, Escape/focus restoration and a 320px modal without horizontal overflow. This fixture does not connect to a backend, RPC or wallet and is not included in the production build. Real funded-wallet claims/exits were not submitted during verification.

## Dividend withdrawal and histories

1. Validate the explicit LABDOG amount with 18 decimal places and check fresh node eligibility and API balances. Active orders or frozen balances prevent another request and prevent LP exit.
2. POST `/dividends/withdrawal-requests` once with `{ amount: "<wei>" }`. Keep the returned order ID even when the wallet session changes while the POST is in flight. Never automatically retry a failed or ambiguous POST.
3. Pass the backend order's `user`, `token`, `amount`, `nonce`, `deadlineSec` and `signature` through to the Hub. The frontend converts decimal strings to ABI bigint values only; it does not reject the order based on deadline age, recover the signature locally, or pre-check `userNonce`, `rewardToken` or `signer`. The Hub is authoritative for `InvalidSignature`, `InvalidNonce`, `DividendExpired`, `DividendTooOld`, `DividendWrongToken`, `DividendForExitedNode` and reward-pool errors.
4. Simulate and submit `claimDividend(req, signature)`. The user authorizes a normal transaction in their injected wallet, not an EIP-712 backend signature. Check the receipt and exact DividendClaimed user/token/amount/nonce/deadline.
5. Query `/dividends/withdrawal-orders/:orderId` every eight seconds while the document is visible. Display chain confirmation separately until the backend returns CLAIMED, then refresh balances. PENDING orders cancelled in the wallet can resume using fresh 4.5 details without another signature request. Submitted hashes prevent duplicate sends in the current browser. Expired orders wait for REFUNDED; no automatic resubmission is made.

Withdrawal history now comes from authenticated GET `/dividends/withdrawals?page=1&pageSize=20`, using the server's `rows`, `total`, `page` and `pageSize`. The client supports the documented `status` and `sourceType` query parameters. No source filter is applied to the displayed history, so both node dividends and manual credits are included. The local-only caption and manual order lookup are removed. Poll the list every eight seconds while visible, and query PENDING/SUBMITTED/EXPIRED orders separately so an active order on another page or device still blocks duplicate withdrawal and LP exit. Browser metadata supplies only local receipts and tracks unresolved transactions through 4.5 until backend synchronization; it does not define history rows or pagination. Continue-claim always fetches fresh 4.5 details before validating and submitting. Signatures and JWTs are never persisted.

The separate dividend history calls `/dividends/history?page=N&pageSize=20`. The live endpoint returned HTTP 200 with `[]`, so both arrays and `{ rows, total }` pagination are supported. For arrays, a full 20-row page enables the next-page control. Because the supplied document does not enumerate row fields, columns follow the returned fields, localizing known date/amount/status columns and formatting wei amount fields without number conversion.

Dividend verification: all 64 automated tests pass, covering order binding, signatures, nonce checks, full claim tuples/events, balance changes, interrupted sessions, resuming orders, storage isolation, API response variants and no automatic POST retries. The isolated qa/dividend.html fixture verifies one request across wallet cancellation/resumption, CLAIMED record synchronization, balances, pagination, invalid-ID feedback and 320px layout. Real authenticated dividend-history access was checked with a temporary test wallet; no real withdrawal order or funded-wallet transaction was submitted.

Withdrawal list integration verification (2026-09-07): the live endpoint returns HTTP 401 without a session. A temporary authenticated wallet returned `[]` for pages 1/2 and PENDING filtering, rather than the newly documented pagination envelope. Accept legacy arrays with total unknown as well as the documented object; only the envelope provides an authoritative total. Legacy arrays are sliced locally to the five-row display page. Nonempty live pagination remains unverified. Automated fixtures cover remote discovery, server totals, wei precision, off-page active orders, local receipt merging and authentication errors. No withdrawal order or chain transaction was created during these checks.
