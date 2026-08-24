// 资产列表卡片化展示（币安暗色风格）：每个资产一张卡，
// 展示资产标识、可用/冻结余额，并提供充值 / 提现 / 交易快捷操作。
// 与 Wallet 页级表单联动：点击充值/提现回调由父组件接管控件展开。

import { useI18n } from "../../i18n";
import { fmtQty } from "../../lib/format";
import { CoinBadge } from "./CoinBadge";

export interface AssetCardRow {
  asset: string;
  available: number;
  frozen: number;
}

export function AssetCards({
  rows,
  onDeposit,
  onWithdraw,
  onTransfer,
}: {
  rows: AssetCardRow[];
  onDeposit: (asset: string) => void;
  onWithdraw: (asset: string) => void;
  onTransfer?: (asset: string) => void;
}) {
  const { t } = useI18n();
  if (!rows.length) return <div className="muted">{t("wallet.noLedger")}</div>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((r) => (
        <div
          key={r.asset}
          className="flex flex-col gap-3 rounded-xl border border-[#2B3139] bg-[#1E2329] p-4 transition-colors hover:border-[#2B3139]/80 hover:bg-[#232831]"
          data-testid={`asset-card-${r.asset}`}
        >
          {/* 资产标识 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CoinBadge asset={r.asset} size={36} />
              <div>
                <div className="text-sm font-semibold text-foreground">{r.asset}</div>
                <a
                  href={`#/trade/${r.asset === "USDT" ? "BTC" : r.asset}USDT`}
                  className="text-[11px] text-[#848E9C] transition-colors hover:text-accent"
                >
                  {t("wallet.trade")}
                </a>
              </div>
            </div>
          </div>

          {/* 余额 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted">{t("wallet.available")}</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fmtQty(r.available)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted">{t("wallet.frozen")}</span>
              <span className="font-mono text-xs tabular-nums text-[#848E9C]">{fmtQty(r.frozen)}</span>
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="mt-auto grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onDeposit(r.asset)}
              data-testid={`card-deposit-${r.asset}`}
              className="rounded-lg border border-[#0ECB81]/50 py-1.5 text-xs font-medium text-[#0ECB81] transition-colors hover:bg-[#0ECB81]/10"
            >
              {t("wallet.deposit")}
            </button>
            <button
              type="button"
              onClick={() => onWithdraw(r.asset)}
              data-testid={`card-withdraw-${r.asset}`}
              className="rounded-lg border border-[#F6465D]/50 py-1.5 text-xs font-medium text-[#F6465D] transition-colors hover:bg-[#F6465D]/10"
            >
              {t("wallet.applyWithdraw")}
            </button>
            <button
              type="button"
              onClick={() => onTransfer?.(r.asset)}
              data-testid={`card-transfer-${r.asset}`}
              className="rounded-lg border border-[#FCD535]/50 py-1.5 text-xs font-medium text-[#FCD535] transition-colors hover:bg-[#FCD535]/10"
            >
              {t("wallet.transfer")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
