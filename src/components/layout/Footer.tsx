// 页脚（币安风格）：多列链接 + 备案信息行，低对比度文字、细分隔线。

const COLUMNS: { title: string; links: string[] }[] = [
  { title: "About Us", links: ["About", "Careers", "Announcements", "News"] },
  { title: "Products", links: ["Spot", "Futures", "Earn", "Launchpad"] },
  { title: "Service", links: ["Downloads", "Fees", "Referral", "APIs"] },
  { title: "Support", links: ["Help Center", "Trading Rules", "Security", "Contact Us"] },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* 品牌区 */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-black text-black">C</span>
              CryptoExchange
            </div>
            <p className="mt-3 max-w-56 text-xs leading-relaxed text-muted">
              Trade crypto with institutional-grade performance, security and liquidity.
            </p>
          </div>

          {/* 链接列 */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[13px] font-semibold text-foreground">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((label) => (
                  <li key={label}>
                    <a href="#/home" className="text-xs text-muted transition-colors hover:text-accent">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-border pt-5 text-xs text-muted sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} CryptoExchange. All rights reserved.</span>
          <span className="tabular-nums">Risk Warning: Trading crypto involves significant risk.</span>
        </div>
      </div>
    </footer>
  );
}
