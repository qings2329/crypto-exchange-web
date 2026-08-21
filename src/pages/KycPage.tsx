// KYC 身份认证页（/kyc）：个人信息 → 证件上传 → 人脸识别 → 提交等待审核。
// 状态机：none（分步填写）→ pending（8s 演示倒计时后自动 approve）→ approved / rejected。
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StepIndicator } from "../components/kyc/StepIndicator";
import { DocUpload } from "../components/kyc/DocUpload";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useKycStore, type IdDocType } from "../store/kyc-store";
import { cn } from "../lib/utils";

const COUNTRIES = ["CN 中国大陆", "HK 中国香港", "TW 中国台湾", "SG 新加坡", "JP 日本", "US 美国", "GB 英国"];

export function KycPage() {
  const { t } = useTranslation();
  const kyc = useKycStore();
  const [fullName, setFullName] = useState(kyc.fullName ?? "");
  const [idType, setIdType] = useState<IdDocType>(kyc.idType ?? "id_card");
  const [idNumber, setIdNumber] = useState(kyc.idNumber ?? "");
  const [country, setCountry] = useState(kyc.country ?? COUNTRIES[0]);
  const [formError, setFormError] = useState(false);
  const [scanning, setScanning] = useState(false);

  // 演示：pending 8 秒后自动审核通过
  useEffect(() => {
    if (kyc.status !== "pending") return;
    const id = setTimeout(() => kyc.approve(), 8000);
    return () => clearTimeout(id);
  }, [kyc.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const infoValid =
    fullName.trim().length >= 2 && idNumber.trim().length >= 5 && country.length > 0;
  const docsValid = idType === "passport" ? !!kyc.front : !!kyc.front && !!kyc.back;

  // ---------- 审核状态视图 ----------
  if (kyc.status === "pending" || kyc.status === "approved" || kyc.status === "rejected") {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10">
        <div
          className={`flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center ${
            kyc.status === "approved" ? "" : ""
          }`}
          data-testid="kyc-status"
        >
          <span className="text-5xl">
            {kyc.status === "pending" ? "⏳" : kyc.status === "approved" ? "✅" : "❌"}
          </span>
          <h1 className="text-lg font-bold">
            {kyc.status === "pending"
              ? t("kyc.awaitReview")
              : kyc.status === "approved"
                ? t("kyc.levelApproved")
                : t("kyc.rejectedTip")}
          </h1>
          <p className="max-w-[420px] text-sm text-muted">
            {kyc.status === "pending"
              ? t("kyc.pendingTip")
              : kyc.status === "approved"
                ? t("kyc.approvedTip")
                : t("kyc.rejectedTip")}
          </p>
          {kyc.status === "pending" && (
            <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
          {(kyc.status === "rejected" || kyc.status === "approved") && (
            <Button variant={kyc.status === "rejected" ? "default" : "outline"} size="sm" onClick={kyc.reset}>
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
              <Button variant="ghost" size="sm" onClick={kyc.reset}>
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
              <Button
                data-testid="kyc-submit"
                onClick={() => {
                  kyc.submit();
                }}
              >
                {t("kyc.submitReview")}
              </Button>
            )}
            {!scanning && (
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => useKycStore.setState({ step: 2 })}>
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

      {/* 当前等级 */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        {t("kyc.currentLevel")}:
        <Badge variant="secondary">{t("kyc.levelNone")}</Badge>
      </div>
    </div>
  );
}
