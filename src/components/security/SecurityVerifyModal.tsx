// 敏感操作二次验证弹窗：高危操作（提现/改密/解绑 2FA）统一拦截器。
// 流程：① 滑块人机校验 → ② 2FA 动态码（本地 TOTP 校验）或邮箱验证码（演示派生码）。
// 通过后 resolve(true)，任一步取消 resolve(false)。
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { useToast } from "../Toast";
import { SliderCaptcha } from "./SliderCaptcha";
import { useGuardedAction } from "../../hooks/use-guarded-action";
import { verifyTotp } from "../../lib/totp";
import { demoEmailCode } from "../../lib/secure-utils";
import { useSecurityStore } from "../../store/security-store";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";

export type SensitiveAction = "withdraw" | "password" | "unbind2fa" | "apikey" | "generic";

interface Props {
  action: SensitiveAction;
  onClose: (ok: boolean) => void;
}

const MAX_ATTEMPTS = 5;

export function SecurityVerifyModal({ action, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { uid } = useAuth();
  const twofaEnabled = useSecurityStore((s) => s.twofaEnabled);
  const twofaSecret = useSecurityStore((s) => s.twofaSecret);

  const [step, setStep] = useState<"captcha" | "verify">("captcha");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"totp" | "email">(twofaEnabled ? "totp" : "email");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const attempts = useRef(0);

  // 演示邮箱验证码：uid+action 确定性派生（真实环境为服务端下发）
  const emailCode = useMemo(() => demoEmailCode(`${uid ?? "anon"}:${action}`), [uid, action]);

  // 发送验证码：防抖 + 60s 接口冷却
  const sendCode = useGuardedAction(
    () => {
      toast.info(t("security.verify.demoCodeToast", { code: emailCode }));
    },
    { key: `send-code:${uid}:${action}`, cooldownMs: 60_000, debounceMs: 0 }
  );

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t("security.verify.badFormat"));
      return;
    }
    setChecking(true);
    setError(null);
    try {
      let ok = false;
      if (mode === "totp") {
        ok = twofaSecret ? await verifyTotp(twofaSecret, code) : false;
      } else {
        ok = code === emailCode;
      }
      if (ok) {
        onClose(true);
        return;
      }
      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) {
        toast.error(t("security.verify.tooManyAttempts"));
        onClose(false);
        return;
      }
      setError(t("security.verify.wrongCode", { left: MAX_ATTEMPTS - attempts.current }));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      title={t("security.verify.title")}
      onClose={() => onClose(false)}
      width={420}
    >
      <div className="flex flex-col gap-4 p-1">
        {/* 风险提示条 */}
        <p className="rounded-lg bg-tag-bg px-3 py-2 text-xs leading-relaxed text-muted">
          🔒 {t(`security.verify.risk.${action}`)}
        </p>

        {step === "captcha" ? (
          <div className="flex flex-col gap-3" data-testid="verify-step-captcha">
            <SliderCaptcha onPass={(tok) => setCaptchaToken(tok)} />
            <Button disabled={!captchaToken} onClick={() => setStep("verify")} data-testid="captcha-next">
              {t("security.verify.next")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="verify-step-code">
            {/* 验证方式 Tab */}
            <div className="flex gap-5 border-b border-border px-1">
              {(["totp", "email"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={m === "totp" && !twofaEnabled}
                  data-testid={`verify-tab-${m}`}
                  className={cn(
                    "relative cursor-pointer pb-2.5 text-[13px] transition-colors",
                    mode === m ? "font-semibold text-accent" : "text-muted hover:text-foreground",
                    m === "totp" && !twofaEnabled && "cursor-not-allowed opacity-40 hover:text-muted"
                  )}
                >
                  {t(m === "totp" ? "security.verify.tabTotp" : "security.verify.tabEmail")}
                  {mode === m && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>

            {mode === "totp" && !twofaEnabled && (
              <p className="text-xs text-sell">{t("security.verify.totpOffHint")}</p>
            )}

            {/* 验证码输入 */}
            <div className="flex items-center gap-2">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("security.verify.codePlaceholder")}
                data-testid="verify-code-input"
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-center font-mono text-lg tracking-[0.4em] tabular-nums text-foreground outline-none focus:border-accent"
              />
              {mode === "email" && (
                <button
                  onClick={() => sendCode.run()}
                  disabled={sendCode.cooling}
                  data-testid="send-email-code"
                  className={cn(
                    "h-10 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors",
                    sendCode.cooling
                      ? "cursor-not-allowed border-border text-muted"
                      : "cursor-pointer border-accent text-accent hover:bg-tag-bg"
                  )}
                >
                  {sendCode.cooling
                    ? t("security.verify.resendIn", { s: Math.ceil(sendCode.remainingMs / 1000) })
                    : t("security.verify.sendCode")}
                </button>
              )}
            </div>

            {error && (
              <p className="text-xs text-sell" role="alert" data-testid="verify-error">
                {error}
              </p>
            )}

            <Button disabled={!/^\d{6}$/.test(code) || checking} onClick={() => void submit()} data-testid="verify-submit">
              {t("security.verify.submit")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
