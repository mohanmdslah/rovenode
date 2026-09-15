import {
  ArrowDown,
  ArrowRight,
  ArrowClockwise,
  CheckCircle,
  Coins,
  Drop,
  Export,
  HandCoins,
  LockKey,
  ShieldCheck,
  SpinnerGap,
  Wallet,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../i18n.jsx";
import { formatWalletAddress } from "../lib/wallet.js";
import { parseFeeWithdrawalAmount } from "../lib/node-center.js";
import { api, formatPriceWei, formatRoundedWei, formatWei, readWei } from "../lib/api.js";
import { apiCopy } from "../lib/api-copy.js";
import { useApiResource } from "../lib/use-api-resource.js";
import { hubActionBlock, nodeHub } from "../lib/node-hub.js";
import { nodeHubCopy } from "../lib/node-hub-copy.js";
import { useHubAction } from "../lib/use-hub-action.js";
import { BSCSCAN_TX_URL } from "../lib/network.js";
import { NodeExitDialog } from "./NodeExitDialog.jsx";
import { dividendCopy } from "../lib/dividend-copy.js";
import { useDividendOrders } from "../lib/use-dividend-orders.js";
import { prepareDividendWithdrawal } from "../lib/dividend-withdrawal.js";
import { DividendHistory } from "./DividendHistory.jsx";

const copyByLocale = {
  "zh-CN": {
    kicker: "NODE CENTER / 节点中心", title: "你的节点资产控制台", body: "查看节点身份、锁仓权益与流动性账户。当前价格与资产读数仅在管理合约接入后从 BSC 注入钱包实时读取。", initial: "开盘初始价格", current: "当前底池价格", pending: "待底池接入", identity: "节点身份", member: "已是节点", nonMember: "尚未成为节点", buy: "前往节点购买", connected: "管理合约已配置", connect: "连接钱包后查看", locked: "锁仓代币", claimable: "可领取代币", lp: "持有 LP 份额", fees: "可提取手续费", unavailable: "管理合约待接入", dataPending: "链上数据待接入", claim: "领取锁仓代币", remove: "移除 LP", withdraw: "提取交易手续费", amount: "提取数量 (ROVE)", available: "可提取", submit: "提交提取", records: "手续费提取记录", noRecords: "暂无提取记录", hash: "交易哈希", noContract: "管理合约地址尚未配置，操作暂不可用。", required: "请输入提取数量。", invalid: "请输入有效的 ROVE 数量。", positive: "数量必须大于 0。", exceeds: "提取数量超过可用手续费。", success: "交易已提交，等待链上确认。", failed: "交易失败，请检查钱包后重试。", contractScope: "节点购买合约只负责 150 USDT 入账；锁仓、LP 与手续费操作需要独立的经审计管理合约。" },
  en: { kicker: "NODE CENTER / CONTROL", title: "Your node asset console", body: "View node identity, locked rights and liquidity account. Price and asset readings become live from BSC once the management contract is connected to the injected wallet.", initial: "Opening price", current: "Current pool price", pending: "Pool price pending", identity: "Node identity", member: "Node member", nonMember: "Not a node yet", buy: "Go to node purchase", connected: "Management contract configured", connect: "Connect wallet to view", locked: "Locked tokens", claimable: "Claimable tokens", lp: "LP share", fees: "Withdrawable fees", unavailable: "Management contract pending", dataPending: "On-chain data pending", claim: "Claim locked tokens", remove: "Remove LP", withdraw: "Withdraw trading fees", amount: "Amount to withdraw (ROVE)", available: "Available", submit: "Submit withdrawal", records: "Fee withdrawal history", noRecords: "No withdrawals yet", hash: "Transaction hash", noContract: "Management contract is not configured, so actions are unavailable.", required: "Enter a withdrawal amount.", invalid: "Enter a valid ROVE amount.", positive: "Amount must be greater than 0.", exceeds: "Amount exceeds available fees.", success: "Transaction submitted; waiting for confirmation.", failed: "Transaction failed. Check your wallet and retry.", contractScope: "The node purchase contract only routes the 150 USDT deposit. Locking, LP and fee actions require a separate audited management contract." },
  "ko": { kicker: "NODE CENTER / 노드 센터", title: "노드 자산 콘솔", body: "노드 신원, 락업 권리와 유동성 계정을 확인합니다. 관리 컨트랙트 연결 후 BSC에서 실시간 데이터를 읽습니다.", initial: "상장 초기 가격", current: "현재 풀 가격", pending: "풀 가격 대기", identity: "노드 신원", member: "노드 회원", nonMember: "아직 노드가 아닙니다", buy: "노드 구매로 이동", connected: "지갑 연결됨", connect: "지갑을 연결해 확인", locked: "락업 토큰", claimable: "청구 가능 토큰", lp: "LP 지분", fees: "출금 가능 수수료", unavailable: "관리 컨트랙트 대기", dataPending: "온체인 데이터 대기", claim: "락업 토큰 청구", remove: "LP 제거", withdraw: "거래 수수료 출금", amount: "출금 수량 (ROVE)", available: "출금 가능", submit: "출금 제출", records: "수수료 출금 기록", noRecords: "출금 기록 없음", hash: "거래 해시", noContract: "관리 컨트랙트가 설정되지 않아 작업을 사용할 수 없습니다.", required: "출금 수량을 입력하세요.", invalid: "유효한 ROVE 수량을 입력하세요.", positive: "수량은 0보다 커야 합니다.", exceeds: "사용 가능한 수수료를 초과합니다.", success: "거래가 제출되었습니다.", failed: "거래에 실패했습니다.", contractScope: "노드 구매 컨트랙트는 150 USDT 입금만 처리합니다. 락업, LP와 수수료 작업에는 별도 감사 컨트랙트가 필요합니다." },
  "ja": { kicker: "NODE CENTER / ノードセンター", title: "ノード資産コンソール", body: "ノード身份、ロック権利、流動性口座を確認します。管理コントラクト接続後にBSCから読み取ります。", initial: "開始価格", current: "現在のプール価格", pending: "プール価格待ち", identity: "ノード身份", member: "ノード参加済み", nonMember: "まだノードではありません", buy: "ノード購入へ", connected: "ウォレット接続済み", connect: "ウォレット接続で表示", locked: "ロックトークン", claimable: "請求可能トークン", lp: "LPシェア", fees: "引出可能手数料", unavailable: "管理コントラクト待ち", dataPending: "オンチェーンデータ待ち", claim: "ロックトークンを請求", remove: "LPを削除", withdraw: "取引手数料を引出", amount: "引出数量 (ROVE)", available: "利用可能", submit: "引出を送信", records: "手数料引出履歴", noRecords: "履歴なし", hash: "取引ハッシュ", noContract: "管理コントラクト未設定のため操作できません。", required: "数量を入力してください。", invalid: "有効なROVE数量を入力してください。", positive: "数量は0より大きくしてください。", exceeds: "利用可能な手数料を超えています。", success: "取引を送信しました。", failed: "取引に失敗しました。", contractScope: "ノード購入コントラクトは150 USDTの入金のみを処理します。ロック、LP、手数料操作には別の監査済みコントラクトが必要です。" },
  vi: { kicker: "NODE CENTER / TRUNG TÂM NODE", title: "Bảng điều khiển tài sản node", body: "Xem danh tính node, quyền khóa và tài khoản thanh khoản. Dữ liệu sẽ đọc trực tiếp từ BSC sau khi kết nối hợp đồng quản lý.", initial: "Giá mở cửa", current: "Giá pool hiện tại", pending: "Đang chờ giá pool", identity: "Danh tính node", member: "Đã là node", nonMember: "Chưa là node", buy: "Đến khu mua node", connected: "Đã kết nối ví", connect: "Kết nối ví để xem", locked: "Token bị khóa", claimable: "Token có thể nhận", lp: "Tỷ lệ LP", fees: "Phí có thể rút", unavailable: "Chờ hợp đồng quản lý", dataPending: "Chờ dữ liệu on-chain", claim: "Nhận token bị khóa", remove: "Gỡ LP", withdraw: "Rút phí giao dịch", amount: "Số lượng rút (ROVE)", available: "Có thể rút", submit: "Gửi lệnh rút", records: "Lịch sử rút phí", noRecords: "Chưa có giao dịch", hash: "Mã giao dịch", noContract: "Hợp đồng quản lý chưa được cấu hình nên thao tác đang tạm khóa.", required: "Nhập số lượng cần rút.", invalid: "Nhập số ROVE hợp lệ.", positive: "Số lượng phải lớn hơn 0.", exceeds: "Vượt quá số phí khả dụng.", success: "Đã gửi giao dịch, đang chờ xác nhận.", failed: "Giao dịch thất bại, hãy kiểm tra ví.", contractScope: "Hợp đồng mua node chỉ xử lý khoản nạp 150 USDT. Khóa, LP và phí cần hợp đồng quản lý riêng đã kiểm toán." },
};

function scrollToPurchase() {
  const target = document.getElementById("node");
  target?.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function NodeCenter({ walletAddress, walletBusy, onConnect, token, provider, onUnauthorized }) {
  const { locale } = useLocale();
  const labels = copyByLocale[locale] ?? copyByLocale.en;
  const [amount, setAmount] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [exitSession, setExitSession] = useState("");
  const [confirmedFeeOrder, setConfirmedFeeOrder] = useState("");
  useEffect(() => setAmount(""), [walletAddress]);
  const messages = apiCopy[locale];
  const chainCopy = nodeHubCopy[locale];
  const feeCopy = dividendCopy[locale];
  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);
  const transaction = useHubAction(provider, walletAddress, token, refresh);
  const loadDividends = useCallback((signal) => api.dividends(token, signal), [token]);
  const loadAssets = useCallback((signal) => nodeHub.read({ provider, account: walletAddress, signal }), [provider, walletAddress, token]);
  const authError = useCallback((error) => { if (error.status === 401) onUnauthorized(token); }, [token, onUnauthorized]);
  const orders = useDividendOrders({ account: walletAddress, token, refreshKey: refreshTick, onUnauthorized, onChange: refresh });
  const price = useApiResource(api.price, true, refreshTick);
  const dividends = useApiResource(loadDividends, Boolean(token), refreshTick, authError);
  const assets = useApiResource(loadAssets, Boolean(walletAddress && token), refreshTick);
  const isNode = assets.data?.nodeId > 0n && !assets.data.exited;
  const identityStatus = assets.status === "ready" ? assets.data.exited ? "exited" : isNode ? "member" : "nonNode" : assets.status === "error" ? "unknown" : "loading";
  const claimBlock = hubActionBlock(assets.data, "claimLocked");
  const exitBlock = hubActionBlock(assets.data, "removeLP");
  // claimDividend validation belongs to the Hub. The frontend only keeps
  // wallet/session safety checks and passes the backend order through.
  const feeBlock = "";
  const activeOrder = Boolean(orders.data?.active.length || dividends.data?.pendingFreeze > 0n);
  const actionHint = (block, available) => !walletAddress ? labels.connect : assets.status === "error" ? chainCopy.readFailed : block ? chainCopy[block] : available;
  const withdrawError = amount ? parseFeeWithdrawalAmount(amount, dividends.data?.available) : null;
  const feeDisabled = !withdrawError?.ok || Boolean(feeBlock) || orders.status !== "ready" || dividends.status !== "ready" || activeOrder || transaction.busy || walletBusy;
  const feeHint = activeOrder ? feeCopy.activeOrder : feeCopy.amountHelp;
  const feeOrderKey = `${walletAddress}:${token}:${transaction.status.orderId}`;
  const feeConfirmed = confirmedFeeOrder === feeOrderKey;
  useEffect(() => {
    if (orders.data?.details.some((row) => row.orderId === transaction.status.orderId && row.status === "CLAIMED")) setConfirmedFeeOrder(feeOrderKey);
  }, [orders.data, transaction.status.orderId, feeOrderKey]);
  const submitWithdrawal = (resumeOrder) => {
    if (transaction.busy || walletBusy || feeBlock || resumeOrder?.hash || (!resumeOrder && feeDisabled)) return;
    const owner = walletAddress;
    let capturedOrder = resumeOrder;
    void transaction.execute("claimDividend", {
      prepare: ({ signal, onStatus }) => prepareDividendWithdrawal({
        provider, account: owner, token, amount: resumeOrder ? readWei(resumeOrder.amount) : withdrawError.value, orderId: resumeOrder?.orderId, signal, onStatus,
        onOrder: (order) => { capturedOrder = order; orders.save(order, owner); },
      }),
      onStatus: (status) => { if (capturedOrder && status.hash) orders.save({ ...capturedOrder, hash: status.hash, status: "SUBMITTED" }, owner); },
      onError: (error) => {
        authError(error);
        if (capturedOrder && ["TRANSACTION_CANCELLED", "TRANSACTION_FAILED"].includes(error.code)) orders.save({ ...capturedOrder, hash: "", status: "PENDING" }, owner);
      },
    });
  };
  const resourceLabel = (resource) => messages[resource.status === "ready" ? "synced" : resource.status === "error" ? "error" : "loading"];
  const metrics = [
    ["locked", LockKey, formatWei(assets.data?.lockedTotal, locale)],
    ["claimable", Coins, formatWei(assets.data?.claimable, locale)],
    ["lp", Drop, formatWei(assets.data?.lpShare, locale)],
    ["fees", HandCoins, `${formatRoundedWei(dividends.data?.available, locale)} ROVE`],
  ];

  return (
    <section className="node-center-section" id="node-center">
      <div className="section-shell">
        <div className="section-heading split-heading" data-reveal="item">
          <div><p className="section-kicker">{labels.kicker}</p><h2>{labels.title}</h2></div>
          <p>{chainCopy.body}</p>
        </div>

        <div className="node-center-pricebar" data-reveal="item">
          <div><span>{labels.initial}</span><strong>{formatPriceWei(price.data?.initialPrice, locale)} <small>BNB</small></strong></div>
          <ArrowRight size={20} aria-hidden="true" />
          <div aria-live="polite"><span>{labels.current} · BNB</span><strong>{price.status === "ready" ? price.data.lastPrice > 0n ? formatPriceWei(price.data.lastPrice, locale) : messages.noPrice : resourceLabel(price)}</strong></div>
          <div className="node-center-status"><span>BSC MAINNET · 56</span><button className="node-refresh" type="button" onClick={() => setRefreshTick((value) => value + 1)} title={messages.retry} aria-label={messages.retry}><ArrowClockwise size={18} /></button></div>
        </div>

        <div className="node-center-grid">
          <article className="node-identity-panel" data-reveal="item">
            <div className="node-center-panel-head"><span><ShieldCheck size={18} weight="fill" />{labels.identity}</span><small>{walletAddress ? formatWalletAddress(walletAddress) : "EIP-1193"}</small></div>
            <div className={`node-identity-state ${isNode ? "is-node" : ""}`} aria-live="polite">
              {isNode ? <CheckCircle size={38} weight="fill" /> : walletAddress && identityStatus === "loading" ? <SpinnerGap className="node-spinner" size={38} /> : <XCircle size={38} weight="fill" />}
              <strong>{!walletAddress ? labels.connect : messages[identityStatus]}</strong>
              <small>BSC MAINNET · 56</small>
            </div>
            {!walletAddress ? <button className="primary-button node-center-connect" type="button" onClick={onConnect} disabled={walletBusy}><Wallet size={17} weight="fill" />{labels.connect}</button> : identityStatus === "nonNode" ? <button className="text-button node-center-buy" type="button" onClick={scrollToPurchase}>{labels.buy}<ArrowDown size={17} /></button> : null}
          </article>

          <div className="node-metrics" data-reveal="stagger">
            {metrics.map(([key, Icon, value]) => <article key={key}><Icon size={21} weight="fill" /><span>{key === "locked" ? chainCopy.lockedTotal : key === "lp" ? chainCopy.lpShare : labels[key]}</span><strong>{walletAddress ? value : "—"}</strong><small>{key === "locked" || key === "claimable" ? "ROVE · " : key === "lp" ? "LP · " : ""}{walletAddress ? resourceLabel(key === "fees" ? dividends : assets) : labels.connect}</small></article>)}
          </div>
        </div>

        <div className="node-center-actions" data-reveal="item">
          <div className="node-action-card"><div><LockKey size={22} weight="fill" /><h3>{labels.claim}</h3><p id="node-claim-hint">{actionHint(claimBlock, chainCopy.claimAll)}</p></div>
            {!assets.data?.exited && <button className="primary-button" type="button" disabled={Boolean(claimBlock) || transaction.busy || walletBusy} aria-describedby="node-claim-hint" onClick={() => transaction.execute("claimLocked")}>{labels.claim}{transaction.busy && transaction.status.action === "claimLocked" ? <SpinnerGap className="node-spinner" size={17} /> : <ArrowRight size={17} />}</button>}
          </div>
          <div className="node-action-card"><div><Drop size={22} weight="fill" /><h3>{labels.remove}</h3><p>{chainCopy.exitWarning}</p><p id="node-exit-hint">{actionHint(exitBlock, chainCopy.exitAll)}</p></div>
            {activeOrder && <p>{feeCopy.activeOrder}</p>}
            {!assets.data?.exited && <button className="primary-button" type="button" disabled={Boolean(exitBlock) || activeOrder || transaction.busy || walletBusy} aria-describedby="node-exit-hint" onClick={() => setExitSession(`${walletAddress}:${token}`)}>{labels.remove}{transaction.busy && transaction.status.action === "removeLP" ? <SpinnerGap className="node-spinner" size={17} /> : <ArrowRight size={17} />}</button>}
          </div>
          <div className="node-action-card fee-action-card">
            <div><HandCoins size={22} weight="fill" /><h3>{labels.withdraw}</h3><p>{labels.available}: {formatRoundedWei(dividends.data?.available, locale)} ROVE</p><p id="fee-action-hint">{feeHint}</p></div>
            <form onSubmit={(event) => { event.preventDefault(); submitWithdrawal(); }}><label>
              <span>{labels.amount}</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label={labels.amount} aria-invalid={Boolean(withdrawError && !withdrawError.ok)} aria-describedby="fee-input-error fee-action-hint" disabled={transaction.busy} />
              <button type="submit" disabled={feeDisabled}>{labels.submit}{transaction.busy && transaction.status.action === "claimDividend" ? <SpinnerGap className="node-spinner" size={16} /> : <ArrowRight size={16} />}</button>
            </label></form>
            {withdrawError && !withdrawError.ok && <small id="fee-input-error" className="node-form-error">{labels[withdrawError.errorKey]}</small>}
          </div>
        </div>

        {transaction.status.phase !== "idle" && <div className="node-hub-transaction" role="status" aria-live="polite">
          <strong>{transaction.status.action === "claimLocked" ? chainCopy.claimReceipt : transaction.status.action === "claimDividend" ? feeCopy.feeReceipt : chainCopy.exitReceipt}</strong>
          <span>{transaction.status.phase === "error" ? transaction.status.detail ?? feeCopy[transaction.status.error] ?? chainCopy[transaction.status.error] ?? chainCopy.failed : transaction.status.action === "claimDividend" && transaction.status.phase === "success" ? feeConfirmed ? feeCopy.CLAIMED : feeCopy.chainConfirmed : feeCopy[transaction.status.phase] ?? chainCopy[transaction.status.phase]}</span>
          {transaction.status.hash && <a href={`${BSCSCAN_TX_URL}${transaction.status.hash}`} target="_blank" rel="noreferrer">{chainCopy.receipt} · {transaction.status.hash.slice(0, 10)}...{transaction.status.hash.slice(-6)}<Export size={14} aria-hidden="true" /></a>}
        </div>}

        <NodeExitDialog open={Boolean(token && exitSession === `${walletAddress}:${token}`)} copy={chainCopy} disabled={Boolean(exitBlock) || activeOrder || transaction.busy || walletBusy} onCancel={() => setExitSession("")} onConfirm={() => { setExitSession(""); void transaction.execute("removeLP"); }} />

        <DividendHistory account={walletAddress} token={token} locale={locale} orders={orders} refreshKey={refreshTick} onRefresh={refresh} onUnauthorized={onUnauthorized} onResume={submitWithdrawal} busy={transaction.busy || walletBusy || Boolean(feeBlock)} />

        <p className="node-center-disclosure"><ShieldCheck size={17} weight="fill" />{chainCopy.scope}</p>
      </div>
    </section>
  );
}
