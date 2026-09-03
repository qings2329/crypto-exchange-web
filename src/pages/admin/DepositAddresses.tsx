import { useCallback, useState } from "react";
import { adminApi, type DepositAddress } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";

const PAGE_SIZE = 20;

function truncateAddr(a: string, n = 10) {
  if (!a || a.length <= n * 2) return a;
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };
  return (
    <button
      className="ml-1 text-xs text-accent hover:underline cursor-pointer"
      onClick={copy}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export default function DepositAddresses() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const loader = useCallback(
    () =>
      adminApi.depositAddresses({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: search || undefined,
      }),
    [page, search]
  );

  const { data, loading, err, reload } = useAdminData(loader, [page, search]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader title="充值地址" />

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline cursor-pointer" onClick={reload}>
            重试
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          className="h-8 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="搜索用户ID / 地址…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="outline" size="sm" onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && data && data.items.length === 0 && <EmptyState text="暂无充值地址" />}

      {data && data.items.length > 0 && (
        <>
          <AdminTable columns={["用户ID", "链", "充值地址"]}>
            {data.items.map((addr: DepositAddress, i: number) => (
              <tr key={`${addr.user_id}-${addr.chain}-${i}`} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{addr.user_id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{addr.chain}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted max-w-[360px] truncate">
                  {truncateAddr(addr.address, 16)}
                  <CopyBtn text={addr.address} />
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
