// KYC 身份认证页（/kyc）：个人信息 → 证件上传 → 人脸识别 → 提交等待审核。
// 状态机由服务端驱动：GET /api/v1/user/kyc（惰性落审：pending 10s 后 approve / 尾号 000 reject），
// 本页 4s 轮询 pending；权益额度来自响应 limits，不前端硬编码。
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StepIndicator } from "../components/kyc/StepIndicator";
import { DocUpload } from "../components/kyc/DocUpload";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { api, ApiError, type KycLimits, type UserKyc } from "../api/client";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { useKycStore, type IdDocType } from "../store/kyc-store";
import { cn } from "../lib/utils";

const COUNTRIES = ["CN 中国大陆", "HK 中国香港", "TW 中国台湾", "SG 新加坡", "JP 日本", "US 美国", "GB 英国"];

export function KycPage() {
  const { t } = useTranslation();
  const { uid } = useAuth();
  const toast = useToast();
  const kyc = useKycStore();

  const [record, setRecord] = useState<UserKyc | null>(null);
  const [limits, setLimits] = useState<KycLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState(kyc.fullName ?? "");
  const [idType, setIdType] = useState<IdDocType>(kyc.idType ?? "id_card");
  const [idNumber, setIdNumber] = useState(kyc.idNumber ?? "");
  const [country, setCountry] = useState(kyc.country ?? COUNTRIES[0]);
  const [formError, setFormError] = useState(false);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.userKycGet();
      setRecord(r.kyc);
      setLimits(r.limits);
      return r.kyc;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, uid]);

  // pending 轮询（4s），审核落定后停止
  useEffect(() => {
    if (record?.status !== 1) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [record?.status, refresh]);

  // 离开人脸步骤或提交落定后复位扫描态，避免重新认证时残留
  useEffect(() => {
    setScanning(false);
  }, [kyc.step]);

  const infoValid =
    fullName.trim().length >= 2 && idNumber.trim().length >= 5 && country.length > 0;
  const docsValid = idType === "passport" ? !!kyc.front : !!kyc.front && !!kyc.back;

  const submitReview = async () => {
    setSubmitting(true);
    try {
      await api.userKycSubmit({
        real_name: fullName.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
        country,
        doc_front_name: kyc.front?.name ?? "",
        doc_back_name: kyc.back?.name ?? "",
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e : t("kyc.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 审核状态视图 ----------
  if (!loading && record && record.status !== 0) {
    const st = record.status; // 1 pending / 2 approved / 3 rejected
    return (
      <div className="mx-auto max-w-[720px] px-4 py-10">
        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center",
            st === 2 ? "border-buy/40" : st === 3 ? "border-sell/40" : "border-border"
          )}
          data-testid="kyc-status"
        >
          <span className="text-5xl">{st === 1 ? "⏳" : st === 2 ? "✅" : "❌"}</span>
          <h1 className="text-lg font-bold">
            {st === 1 ? t("kyc.awaitReview") : st === 2 ? t("kyc.levelApproved") : t("kyc.rejectedTip")}
          </h1>
          <p className="max-w-[420px] text-sm text-muted">
            {st === 1
              ? t("kyc.pendingTip")
              : st === 2
                ? t("kyc.approvedTip")
                : record.reject_reason || t("kyc.rejectedTip")}
          </p>
          {record.reject_reason && st === 3 && (
            <p className="rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell" data-testid="kyc-reject-reason">
              {t("kyc.rejectReasonLabel")}: {record.reject_reason}
            </p>
          )}
          {st === 1 && (
            <>
              <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs text-muted">
                {t("kyc.submittedAt")}: {record.submitted_at ? new Date(record.submitted_at).toLocaleString() : "-"}
              </p>
            </>
          )}
          {st === 2 && (
            <div className="mt-1 grid w-full max-w-[460px] grid-cols-3 gap-2 text-left" data-testid="kyc-limits">
              <LimitCell label={t("kyc.limitWithdraw")} value={`$${limits?.withdraw_daily_usdt.toLocaleString() ?? "-"}`} testid="limit-withdraw" />
              <LimitCell label={t("kyc.limitFiat")} value={limits?.fiat_otc ? t("kyc.entitled") : t("kyc.notEntitled")} ok={limits?.fiat_otc} />
              <LimitCell label={t("kyc.limitFutures")} value={limits?.futures ? t("kyc.entitled") : t("kyc.notEntitled")} ok={limits?.futures} />
            </div>
          )}
          {(st === 3 || st === 2) && st === 3 && (
            <Button
              variant="default"
              size="sm"
              data-testid="kyc-resubmit"
              onClick={() => {
                kyc.gotoStep(1);
                setRecord(null);
              }}
            >
              {t("kyc.resubmit")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---------- 分步填写 ----------
  return (
    <div className="mx-auto max-w-[720px] px-4 py-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold">{t("kyc.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("kyc.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <StepIndicator current={kyc.step} />

        {/* 第一步：个人信息 */}
        {kyc.step === 1 && (
          <div className="mt-6 flex flex-col gap-4" data-testid="kyc-form">
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("kyc.fullName")}
              <input
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setFormError(false);
                }}
                placeholder="ZHANG SAN"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted">
                {t("kyc.idType")}
                <select
                  value={idType}
                  onChange={(e) => setIdType(e.target.value as IdDocType)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-accent"
                >
                  <option value="id_card">{t("kyc.idCard")}</option>
                  <option value="passport">{t("kyc.passport")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {t("kyc.country")}
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-accent"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("kyc.idNumber")}
              <input
                value={idNumber}
                onChange={(e) => {
                  setIdNumber(e.target.value.trim());
                  setFormError(false);
                }}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
              />
            </label>
            {formError && (
              <p className="text-xs text-sell" role="alert">
                {t("kyc.incompleteForm")}
              </p>
            )}
            <Button
              className="self-end"
              onClick={() => {
                if (!infoValid) {
                  setFormError(true);
                  return;
                }
                kyc.setInfo({ fullName: fullName.trim(), idType, idNumber: idNumber.trim(), country });
                kyc.nextStep();
              }}
            >
              {t("kyc.nextStep")}
            </Button>
          </div>
        )}

        {/* 第二步：证件上传 */}
        {kyc.step === 2 && (
          <div className="mt-6 flex flex-col gap-4" data-testid="kyc-upload">
            <div className={cn("grid gap-4", idType === "id_card" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
              <DocUpload label={idType === "id_card" ? t("kyc.frontSide") : t("kyc.passportPage")} doc={kyc.front} onSelect={(d) => kyc.setDocs({ front: d })} />
              {idType === "id_card" && (
                <DocUpload label={t("kyc.backSide")} doc={kyc.back} onSelect={(d) => kyc.setDocs({ back: d })} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => kyc.gotoStep(1)}>
                ← {t("kyc.prevStep")}
              </Button>
              <Button
                disabled={!docsValid}
                onClick={() => {
                  if (docsValid) kyc.nextStep();
                }}
              >
                {t("kyc.nextStep")}
              </Button>
            </div>
          </div>
        )}

        {/* 第三步：人脸识别 */}
        {kyc.step === 3 && (
          <div className="mt-6 flex flex-col items-center gap-4" data-testid="kyc-face">
            <div
              className={cn(
                "relative grid size-40 place-items-center overflow-hidden rounded-full border-4",
                scanning ? "animate-pulse border-accent" : "border-border bg-panel-2/30"
              )}
            >
              <span className="text-5xl">🙂</span>
              {scanning && (
                <span className="absolute inset-x-0 h-0.5 animate-bounce bg-accent" style={{ animationDuration: "1.2s" }} />
              )}
            </div>
            <p className="text-sm text-muted">{scanning ? t("kyc.faceScanning") : t("kyc.faceStart")}</p>
            {scanning && (
              <Button data-testid="kyc-submit" disabled={submitting} onClick={() => void submitReview()}>
                {submitting ? t("kyc.submitting") : t("kyc.submitReview")}
              </Button>
            )}
            {!scanning && (
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => kyc.gotoStep(2)}>
                  ← {t("kyc.prevStep")}
                </Button>
                <Button data-testid="kyc-face-start" onClick={() => setScanning(true)}>
                  {t("kyc.faceStart")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 当前等级与权益对比 */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        {t("kyc.currentLevel")}:
        <Badge variant="secondary">{limits?.level === 2 ? t("kyc.levelApproved") : t("kyc.levelNone")}</Badge>
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card" data-testid="kyc-compare">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2.5 text-left font-medium">{t("kyc.compareItem")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("kyc.levelNone")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("kyc.levelAdvanced")}</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label={t("kyc.limitWithdraw")} a="$1,000" b="$50,000" />
            <CompareRow label={t("kyc.limitFiat")} a={t("kyc.notEntitled")} b={t("kyc.entitled")} bOk />
            <CompareRow label={t("kyc.limitFutures")} a={t("kyc.notEntitled")} b={t("kyc.entitled")} bOk />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LimitCell({ label, value, ok, testid }: { label: string; value: string; ok?: boolean; testid?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-2/30 px-3 py-2.5">
      <p className="truncate text-[11px] text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono text-sm font-semibold tabular-nums", ok === undefined ? "text-foreground" : ok ? "text-buy" : "text-muted")} data-testid={testid}>
        {value}
      </p>
    </div>
  );
}

function CompareRow({ label, a, b, bOk }: { label: string; a: string; b: string; bOk?: boolean }) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-[#2B3139]/30">
      <td className="px-4 py-2.5 text-muted">{label}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{a}</td>
      <td className={cn("px-4 py-2.5 text-right font-mono font-semibold tabular-nums", bOk ? "text-buy" : "text-foreground")}>{b}</td>
    </tr>
  );
}
