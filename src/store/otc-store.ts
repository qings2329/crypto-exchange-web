// OTC（法币交易）状态：商家广告为静态 mock 种子；订单本地持久化。
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OtcSide = "buy" | "sell"; // 用户视角：buy=我买入币 / sell=我卖出币
export type OtcCoin = "USDT" | "BTC";
export type OtcFiat = "CNY" | "USD";
export type PayMethod = "wechat" | "alipay" | "bank";

export type OtcOrderStatus = "unpaid" | "paid" | "appealing" | "completed";

/** 商家广告 */
export interface MerchantAd {
  id: string;
  merchant: string;
  verified: boolean;
  side: OtcSide; // 广告方向：side=buy 表示商家收币卖出给用户（用户可点「买入」）
  coin: OtcCoin;
  fiat: OtcFiat;
  /** 溢价率 %：成交单价 = 行情价 × (1 + premium/100)，sell 广告溢价更高 */
  premium: number;
  minLimit: number;
  maxLimit: number;
  available: number; // 可用数量（币）
  trades: number; // 历史成单数
  successRate: number; // 成单率 %
  methods: PayMethod[];
}

export interface ChatMsg {
  from: "me" | "peer";
  text: string;
  ts: number;
}

/** OTC 订单 */
export interface OtcTrade {
  id: string;
  adId: string;
  merchant: string;
  side: OtcSide;
  coin: OtcCoin;
  fiat: OtcFiat;
  price: number;
  qty: number;
  total: number;
  method: PayMethod;
  status: OtcOrderStatus;
  createdAt: number;
  expireAt: number; // 15 分钟付款倒计时截止
  payee: { name: string; bank?: string; account: string };
  chat: ChatMsg[];
}

const PAY_ACCOUNTS: Record<PayMethod, { bank?: string; gen: (i: number) => string }> = {
  wechat: { gen: (i) => `wx_pay_${String(1000 + i)}` },
  alipay: { gen: (i) => `ali_${String(13800000000 + i * 7).slice(0, 11)}` },
  bank: { bank: "招商银行", gen: (i) => `6225 88${String(1000000000 + i * 13).slice(0, 10)}` },
};
export const PAYEE_NAMES = ["李*明", "王*芳", "张*伟", "陈*静", "刘*洋"];

/** 确定性 mock 广告种子（不引入随机漂移，保证渲染稳定） */
// 用元组构建真实对象
function buildAds(): MerchantAd[] {
  const raw: [string, string, boolean, OtcSide, OtcCoin, OtcFiat, number, number, number, number, number, number, PayMethod[]][] = [
    ["OTC-001", "CryptoPro·旗舰", true, "buy", "USDT", "CNY", -0.3, 100, 50000, 152340, 48210, 99.2, ["bank", "alipay"]],
    ["OTC-002", "快速出金王", false, "buy", "USDT", "CNY", -0.1, 500, 200000, 88000, 12650, 97.8, ["alipay", "wechat"]],
    ["OTC-003", "金汇商行", true, "buy", "USDT", "CNY", 0.2, 1000, 300000, 421000, 30120, 99.6, ["bank"]],
    ["OTC-004", "小熊换汇", false, "buy", "USDT", "CNY", 0.5, 100, 8000, 12000, 2100, 95.4, ["wechat"]],
    ["OTC-005", "GlobalDesk", true, "buy", "USDT", "USD", -0.2, 50, 20000, 96000, 15800, 98.9, ["bank"]],
    ["OTC-006", "StarFX", false, "buy", "USDT", "USD", 0.4, 20, 5000, 33000, 4200, 96.1, ["alipay", "bank"]],
    ["OTC-007", "鲸鱼量化", true, "sell", "USDT", "CNY", 0.6, 1000, 500000, 210000, 28900, 99.4, ["bank", "alipay"]],
    ["OTC-008", "闪电兑", false, "sell", "USDT", "CNY", 0.4, 100, 60000, 65000, 9800, 97.2, ["wechat", "alipay"]],
    ["OTC-009", "恒信支付", true, "sell", "USDT", "CNY", 0.8, 500, 150000, 175000, 20300, 98.5, ["bank"]],
    ["OTC-010", "OceanBridge", true, "sell", "USDT", "USD", 0.5, 100, 30000, 88000, 11200, 99.0, ["bank"]],
    ["OTC-011", "BTC 大户场", true, "buy", "BTC", "CNY", -0.5, 500, 2000000, 12.5, 860, 99.1, ["bank"]],
    ["OTC-012", "矿工直供", false, "buy", "BTC", "CNY", -0.2, 200, 800000, 4.2, 310, 96.8, ["alipay", "bank"]],
    ["OTC-013", "Whale Desk", true, "sell", "BTC", "CNY", 0.9, 1000, 3000000, 18.8, 1240, 99.5, ["bank", "alipay"]],
    ["OTC-014", "Satoshis", false, "sell", "BTC", "USD", 0.7, 100, 50000, 6.4, 480, 97.5, ["bank"]],
  ];
  return raw.map(([id, merchant, verified, side, coin, fiat, premium, minLimit, maxLimit, trades, available, successRate, methods]) => ({
    id, merchant, verified, side, coin, fiat, premium, minLimit, maxLimit, trades, available, successRate, methods,
  }));
}

export const ADS: MerchantAd[] = buildAds();

interface OtcState {
  trades: OtcTrade[];
  createTrade: (t: Pick<OtcTrade, "adId" | "merchant" | "side" | "coin" | "fiat" | "price" | "qty" | "total" | "method"> & { id?: string }) => OtcTrade;
  markPaid: (id: string) => void;
  complete: (id: string) => void;
  appeal: (id: string, reason: string) => void;
  addMessage: (id: string, msg: ChatMsg) => void;
}

export const PAY_EXPIRE_MS = 15 * 60 * 1000;

export const useOtcStore = create<OtcState>()(
  persist(
    (set) => ({
      trades: [],
      createTrade: (t) => {
        const now = Date.now();
        const acc = PAY_ACCOUNTS[t.method];
        const trade: OtcTrade = {
          ...t,
          id: t.id ?? `P2P-${now.toString(36).toUpperCase()}`,
          status: "unpaid",
          createdAt: now,
          expireAt: now + PAY_EXPIRE_MS,
          payee: {
            name: PAYEE_NAMES[Math.abs(hashCode(t.adId)) % PAYEE_NAMES.length],
            bank: acc.bank,
            account: acc.gen(Math.abs(hashCode(t.adId)) % 9999),
          },
          chat: [],
        };
        set((s) => ({ trades: [trade, ...s.trades] }));
        return trade;
      },
      markPaid: (id) =>
        set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, status: "paid" as const } : t)) })),
      complete: (id) =>
        set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, status: "completed" as const } : t)) })),
      appeal: (id, reason) =>
        set((s) => ({
          trades: s.trades.map((t) =>
            t.id === id ? { ...t, status: "appealing" as const, chat: [...t.chat, { from: "me" as const, text: `[申诉] ${reason}`, ts: Date.now() }] } : t
          ),
        })),
      addMessage: (id, msg) =>
        set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, chat: [...t.chat, msg] } : t)) })),
    }),
    { name: "cx_otc" }
  )
);

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
