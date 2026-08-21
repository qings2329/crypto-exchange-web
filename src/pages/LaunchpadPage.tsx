// 新币挖矿（Launchpool）：项目卡片（状态/倒计时/质押池）+ 质押操作弹窗。
// 项目列表公开；质押/赎回/领取需登录。奖励由服务端按质押时长实时累计。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { api, ApiError, type LaunchPool, type LaunchPosition, type LaunchProject, type LaunchStatus } from "../api/client";
import { useAuth } from "../lib/auth";
import { fmtAPY, fmtDuration, msUntil } from "../lib/earn-utils";
import { cn } from "../lib/utils";

export function LaunchpadPage() {
  const { t } = useTranslation();
  const { uid } = useAuth();
  const [projects, setProjects] = useState<LaunchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [active, setActive] = useState<{ project: LaunchProject; pool: LaunchPool } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .launchProjects()
      .then(setProjects)
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  // 倒计时秒级跳动
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 排序：进行中 > 即将开始 > 已结束；同状态按开始时间
  const sorted = useMemo(() => {
    const order: Record<LaunchStatus, number> = { ongoing: 0, upcoming: 1, ended: 2 };
    return [...projects].sort((a, b) => order[a.status] - order[b.status]);
  }, [projects]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold">{t("launchpad.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("launchpad.subtitle")}</p>
      </div>

      {loading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="launch-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      )}
      {!loading && error && (
        <p className="py-12 text-center text-sm text-sell" data-testid="launch-error">
          {t("earn.loadFailed")} · {error}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="project-grid">
        {sorted.map((p) => (
          <ProjectCard key={p.id} project={p} now={now} onStake={(pool) => setActive({ project: p, pool })} />
        ))}
      </div>

      {active && (
        <StakeModal
          project={active.project}
          initialPool={active.pool}
          authed={!!uid}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  now,
  onStake,
}: {
  project: LaunchProject;
  now: number;
  onStake: (pool: LaunchPool) => void;
}) {
  const { t } = useTranslation();
  const statusVariant = project.status === "ongoing" ? "success" : project.status === "upcoming" ? "default" : "default";
  const countdown =
    project.status === "upcoming"
      ? t("launchpad.startsIn", { d: fmtDuration(msUntil(project.starts_at, now)) })
      : project.status === "ongoing"
        ? t("launchpad.endsIn", { d: fmtDuration(msUntil(project.ends_at, now)) })
        : "";

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40"
      data-testid={`project-${project.token}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tag-bg text-sm font-bold text-accent">
            {project.token.slice(0, 2)}
          </span>
          <div>
            <p className="text-sm font-bold">
              {project.name}
              <span className="ml-1.5 font-mono text-xs font-normal text-muted">{project.token}</span>
            </p>
            <p className="text-[11px] text-muted">{t("launchpad.totalSupply", { n: project.total_supply })}</p>
          </div>
        </div>
        <Badge variant={statusVariant} data-testid={`status-${project.token}`}>
          <span className="flex items-center gap-1.5">
            {project.status === "ongoing" && <span className="size-1.5 animate-pulse rounded-full bg-buy" />}
            {t(`launchpad.status.${project.status}`)}
          </span>
        </Badge>
      </div>

      {/* 倒计时 */}
      {countdown && (
        <p className="mt-3 rounded-lg bg-panel-2/40 px-3 py-1.5 text-center font-mono text-xs tabular-nums text-muted" data-testid={`countdown-${project.token}`}>
          {countdown}
        </p>
      )}

      {/* 质押池 */}
      <div className="mt-3 flex flex-col gap-1.5">
        {project.pools.map((pool) => (
          <div key={pool.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span className="grid size-6 place-items-center rounded-full bg-tag-bg text-[9px] font-bold text-accent">
                {pool.asset.slice(0, 2)}
              </span>
              {t("launchpad.poolName", { asset: pool.asset })}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-accent">{fmtAPY(pool.apy)}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => onStake(project.pools[0])}
        disabled={project.status === "ended"}
        data-testid={`stake-btn-${project.token}`}
        className={cn(
          "mt-3 h-9 w-full rounded-lg text-sm font-semibold transition-all",
          project.status === "ended"
            ? "cursor-not-allowed bg-panel-2 text-muted"
            : "cursor-pointer bg-accent text-black hover:bg-accent-hover"
        )}
      >
        {project.status === "upcoming" ? t("launchpad.upcomingCta") : project.status === "ended" ? t("launchpad.endedCta") : t("launchpad.stakeNow")}
      </button>
    </div>
  );
}

function StakeModal({
  project,
  initialPool,
  authed,
  onClose,
}: {
  project: LaunchProject;
  initialPool: LaunchPool;
  authed: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [poolId, setPoolId] = useState(initialPool.id);
  const [position, setPosition] = useState<LaunchPosition | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const pool = project.pools.find((x) => x.id === poolId)!;

  const loadPosition = useCallback(
    (pid: string) => {
      if (!authed) return;
      api
        .launchPositions()
        .then((list) => setPosition(list.find((x) => x.project_id === project.id && x.pool_id === pid) ?? null))
        .catch(() => {});
    },
    [authed, project.id]
  );

  useEffect(() => loadPosition(poolId), [poolId, loadPosition]);
  // 奖励实时累计：5s 轮询
  useEffect(() => {
    const id = setInterval(() => loadPosition(poolId), 5000);
    return () => clearInterval(id);
  }, [poolId, loadPosition]);

  const amount = parseFloat(amountStr) || 0;

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      loadPosition(poolId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("earn.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${project.name} · ${t("launchpad.stakeTitle")}`} onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 p-1 text-sm">
        {/* 池 Tab */}
        <div className="flex gap-5 border-b border-border px-1">
          {project.pools.map((p) => (
            <button
              key={p.id}
              onClick={() => setPoolId(p.id)}
              data-testid={`pool-tab-${p.asset}`}
              className={cn(
                "relative cursor-pointer pb-2.5 text-[13px] transition-colors",
                poolId === p.id ? "font-semibold text-accent" : "text-muted hover:text-foreground"
              )}
            >
              {t("launchpad.poolName", { asset: p.asset })}
              {poolId === p.id && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        {/* 我的仓位 */}
        <div className="grid grid-cols-2 gap-3" data-testid="position-panel">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted">{t("launchpad.stakedAmount")}</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums" data-testid="staked-value">
              {(position?.staked ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted">{pool.asset}</span>
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted">{t("launchpad.rewards")}</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-buy" data-testid="rewards-value">
              +{(position?.rewards ?? 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
              <span className="text-xs font-normal text-muted">{project.token}</span>
            </p>
          </div>
        </div>

        {authed ? (
          <>
            {/* 质押输入 */}
            <label className="flex flex-col gap-1 text-xs text-muted">
              {`${t("launchpad.stakeAmount")} (${pool.asset})`}
              <input
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={t("launchpad.stakePlaceholder")}
                data-testid="stake-input"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
              />
            </label>

            <Button
              disabled={!(amount > 0) || busy || project.status !== "ongoing"}
              onClick={() =>
                void act(
                  () => api.launchStake({ project_id: project.id, pool_id: poolId, amount }),
                  t("launchpad.stakedToast")
                )
              }
              data-testid="do-stake"
            >
              {t("launchpad.stake")}
            </Button>

            {/* 赎回 / 领取 */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="sell"
                disabled={!position || position.staked <= 0 || busy}
                onClick={() =>
                  void confirm({ message: t("launchpad.confirmUnstake"), danger: true }).then((ok) => {
                    if (ok && position)
                      void act(() => api.launchUnstake({ position_id: position.id }), t("launchpad.unstakedToast"));
                  })
                }
                data-testid="do-unstake"
              >
                {t("launchpad.unstake")}
              </Button>
              <Button
                variant="buy"
                disabled={!position || (position.rewards ?? 0) <= 0 || busy}
                onClick={() =>
                  position &&
                  void act(() => api.launchHarvest(position.id), t("launchpad.harvestedToast"))
                }
                data-testid="do-harvest"
              >
                {t("launchpad.harvest")}
              </Button>
            </div>

            {project.status === "upcoming" && (
              <p className="rounded-lg bg-tag-bg px-3 py-2 text-center text-xs text-muted">{t("launchpad.notStartedHint")}</p>
            )}
          </>
        ) : (
          <a
            href="#/login"
            className="grid h-9 place-items-center rounded-lg bg-accent text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            {t("launchpad.loginToStake")}
          </a>
        )}
      </div>
    </Modal>
  );
}
