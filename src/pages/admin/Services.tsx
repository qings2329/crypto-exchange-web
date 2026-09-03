import { adminApi, type ServiceHealth } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { AdminHeader, EmptyState, LoadingState } from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

function statusMeta(status: string): {
  label: string;
  variant: string;
  dot: string;
} {
  if (status === "up")
    return { label: "正常运行", variant: "success", dot: "bg-buy" };
  if (status === "degraded")
    return { label: "降级", variant: "secondary", dot: "bg-accent" };
  return { label: "故障", variant: "danger", dot: "bg-sell" };
}

export default function Services() {
  const { data, loading, err, reload } = useAdminData(() => adminApi.services());

  return (
    <div>
      <AdminHeader
        title="服务状态"
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            刷新
          </Button>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && data.length === 0 && <EmptyState />}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <ServiceCard key={s.name} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const meta = statusMeta(service.status);
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-panel-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="font-semibold">{service.name}</span>
        </div>
        <Badge variant={meta.variant as any}>{meta.label}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted">延迟</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums">
            {service.latency_ms != null ? `${service.latency_ms}ms` : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">最后检查</div>
          <div className="mt-0.5 text-sm tabular-nums text-foreground">
            {formatTime(service.last_check)}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
