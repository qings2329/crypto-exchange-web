// 支付方式小图标：微信=绿聊、支付宝=蓝支、银行卡=蓝卡（单色几何风）。
export type PayMethod = "wechat" | "alipay" | "bank";

export function MethodIcon({ method, className = "size-3.5" }: { method: PayMethod; className?: string }) {
  if (method === "wechat") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d="M9.5 4C5.9 4 3 6.4 3 9.4c0 1.7 1 3.2 2.5 4.2l-.6 2 2.2-1.1c.8.2 1.6.4 2.4.4h.4A5.5 5.5 0 0 1 9.5 4zm-2 3a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" />
        <path d="M16 9c-3.3 0-6 2.2-6 4.9s2.7 4.9 6 4.9c.6 0 1.3-.1 1.9-.3l1.9.9-.5-1.7c1.3-.9 2.2-2.2 2.2-3.8C21.5 11.2 19.3 9 16 9zm-2 3.1a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zm4 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z" />
      </svg>
    );
  }
  if (method === "alipay") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v10.2c-2.3-.9-4.9-2-7.2-3A9.6 9.6 0 0 0 15 7H9v-.8H7.5V7H3.6v1.4h8.2c-.5 1.4-1.4 2.7-2.6 3.8-1-.8-1.9-1.8-2.5-2.9H5.2c.7 1.5 1.8 2.9 3.1 4-1 .7-2.2 1.3-3.5 1.8l.6 1.4c1.6-.6 3-1.4 4.2-2.3 1.2.8 2.6 1.5 4 2.1-1.3.5-2.6.9-3.8 1.2L21 14.9v4.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-15z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </svg>
  );
}
