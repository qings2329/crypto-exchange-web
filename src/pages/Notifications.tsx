import { useCallback, useEffect, useState } from "react";
import { api, type UserNotification } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";
import { notificationSocket } from "../services/notification-ws";

// 等级 -> 文案 key（对齐 notify.level*）。
const LEVEL_KEY: Record<string, string> = {
  info: "notify.levelInfo",
  warning: "notify.levelWarning",
  critical: "notify.levelCritical",
};

// 等级 -> 圆点/标签配色（币安语义：info 灰、warning 黄、critical 红）。
const LEVEL_DOT: Record<string, string> = {
  info: "bg-[#848E9C]",
  warning: "bg-[#F0B90B]",
  critical: "bg-[#F6465D]",
};

// 等级 -> 标签文字色（与 LEVEL_DOT 呼应）。
const LEVEL_TEXT: Record<string, string> = {
  info: "text-[#848E9C]",
  warning: "text-[#F0B90B]",
  critical: "text-[#F6465D]",
};

type Tab = "all" | "unread";

export function Notifications() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [list, setList] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const d = await api.userNotifications({ unread_only: tab === "unread" });
      setList(d.notifications);
      setUnread(d.unread);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // 实时推送：建立通知 WebSocket，新通知（KYC/风控/充值/提现）到达时即时插入列表并刷新未读。
  // 替代前端轮询——初始列表仍由 REST 拉取，之后仅由推送增量更新。
  useEffect(() => {
    const off = notificationSocket.onNotification((n) => {
      setList((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev];
      });
      if (!n.read) setUnread((u) => u + 1);
    });
    notificationSocket.connect();
    return () => {
      off();
      notificationSocket.disconnect();
    };
  }, []);

  const markRead = async (id: number) => {
    setBusyId(id);
    try {
      await api.userNotificationRead(id);
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      await api.userNotificationReadAll();
      setList((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await api.userNotificationDelete(id);
      setList((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head flex items-center justify-between">
        <h2>{t("notify.title")}</h2>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <span className="text-xs text-[#F6465D]">
              {t("notify.tabUnread")}: {unread}
            </span>
          )}
          <button className="btn primary" onClick={markAll} disabled={unread === 0}>
            {t("notify.markAllRead")}
          </button>
        </div>
      </div>

      <InlineError err={err} />

      {/* 下划线 Tab */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(["all", "unread"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`relative px-3 py-2 text-[13px] transition-colors ${
              tab === tb ? "font-bold text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {tb === "all" ? t("notify.tabAll") : t("notify.tabUnread")}
            {tab === tb && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mono">{t("common.loading")}</div>
      ) : list.length === 0 ? (
        <div className="muted py-10 text-center">{t("notify.empty")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border border-border bg-card p-3 ${
                n.read ? "opacity-70" : ""
              }`}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_DOT[n.level] ?? "bg-muted"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{n.title}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${LEVEL_TEXT[n.level] ?? "text-muted"}`}>
                    {t(LEVEL_KEY[n.level] ?? "notify.levelInfo")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{n.content}</p>
                <div className="mt-1 text-[11px] text-muted">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!n.read && (
                  <button className="link-btn" disabled={busyId === n.id} onClick={() => markRead(n.id)}>
                    {t("notify.markRead")}
                  </button>
                )}
                <button className="link-btn danger" disabled={busyId === n.id} onClick={() => remove(n.id)}>
                  {t("notify.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
