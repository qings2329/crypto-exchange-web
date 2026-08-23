import { useMemo, useState } from "react";
import { useI18n } from "../i18n";

// 帮助中心 FAQ 数据：分类 + 问答，全部文案走 i18n key（help.*）。
type Faq = { q: string; a: string };
type Category = { id: string; titleKey: string; items: Faq[] };

const CATEGORIES: Category[] = [
  {
    id: "start",
    titleKey: "help.catStart",
    items: [
      { q: "help.q.start1", a: "help.a.start1" },
      { q: "help.q.start2", a: "help.a.start2" },
      { q: "help.q.start3", a: "help.a.start3" },
    ],
  },
  {
    id: "security",
    titleKey: "help.catSecurity",
    items: [
      { q: "help.q.sec1", a: "help.a.sec1" },
      { q: "help.q.sec2", a: "help.a.sec2" },
      { q: "help.q.sec3", a: "help.a.sec3" },
    ],
  },
  {
    id: "trading",
    titleKey: "help.catTrading",
    items: [
      { q: "help.q.trd1", a: "help.a.trd1" },
      { q: "help.q.trd2", a: "help.a.trd2" },
      { q: "help.q.trd3", a: "help.a.trd3" },
    ],
  },
  {
    id: "funds",
    titleKey: "help.catFunds",
    items: [
      { q: "help.q.fnd1", a: "help.a.fnd1" },
      { q: "help.q.fnd2", a: "help.a.fnd2" },
      { q: "help.q.fnd3", a: "help.a.fnd3" },
    ],
  },
];

type Filter = "all" | (typeof CATEGORIES)[number]["id"];

export function Help() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats = CATEGORIES.filter((c) => filter === "all" || c.id === filter);
    return cats
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => {
          if (!q) return true;
          return t(it.q).toLowerCase().includes(q) || t(it.a).toLowerCase().includes(q);
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [filter, query, t]);

  const total = results.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="page">
      {/* 头部 */}
      <div className="page-head flex flex-col gap-1">
        <h2>{t("help.title")}</h2>
        <p className="text-xs text-muted">{t("help.subtitle")}</p>
      </div>

      {/* 搜索框（币安风格） */}
      <div className="relative mb-4">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#848E9C]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("help.searchPlaceholder")}
          className="w-full rounded-lg border border-[#2B3139] bg-[#181A20] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-[#848E9C] outline-none focus:border-accent"
        />
      </div>

      {/* 分类下划线 Tab */}
      <div className="flex flex-wrap gap-1 border-b border-border mb-4">
        {(["all", ...categoryIds()] as Filter[]).map((id) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`relative px-3 py-2 text-[13px] transition-colors ${
              filter === id ? "font-bold text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {id === "all" ? t("help.all") : t(categoryTitle(id))}
            {filter === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* 结果列表 */}
      {total === 0 ? (
        <div className="muted py-10 text-center">{t("help.searchEmpty")}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {results.map((c) => (
            <section key={c.id}>
              <h3 className="mb-2 text-[13px] font-semibold text-foreground">{t(c.titleKey)}</h3>
              <div className="overflow-hidden rounded-lg border border-[#2B3139] bg-[#1E2329]">
                {c.items.map((it, idx) => {
                  const key = `${c.id}:${it.q}`;
                  const isOpen = open === key;
                  return (
                    <div key={key} className={idx > 0 ? "border-t border-[#2B3139]" : ""}>
                      <button
                        onClick={() => setOpen(isOpen ? null : key)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-[#2B3139]/30"
                      >
                        <span>{t(it.q)}</span>
                        <svg
                          className={`size-4 shrink-0 text-[#848E9C] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {isOpen && (
                        <p className="px-4 pb-4 pt-0 text-xs leading-relaxed text-muted">{t(it.a)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 底部联系支持 */}
      <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-[#2B3139] bg-[#181A20] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{t("help.contactTitle")}</div>
          <p className="mt-1 text-xs text-muted">{t("help.contactDesc")}</p>
        </div>
        <a href="mailto:support@ce.dev" className="btn primary shrink-0">
          {t("help.contactBtn")}
        </a>
      </div>
    </div>
  );
}

// 工具：分类 id 列表（避免重复书写）。
function categoryIds(): string[] {
  return CATEGORIES.map((c) => c.id);
}
function categoryTitle(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.titleKey ?? "help.all";
}
