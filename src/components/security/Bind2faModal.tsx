// 谷歌双重验证绑定弹窗：
// 1) 展示 otpauth:// 二维码（Google Authenticator 扫码即用）+ Base32 密钥（可复制）；
// 2) 防误删警示框（黄色）；
// 3) 6 位分格验证码输入：自动前进/退格回跳/粘贴分发，集齐后自动提交真 TOTP 校验（±1 时间窗）。
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { generateSecret, otpauthUrl, verifyTotp } from "../../lib/totp";
import { useToast } from "../Toast";
import { cn } from "../../lib/utils";

interface Props {
  onClose: () => void;
  onEnabled: (secret: string) => void;
}

const CODE_LEN = 6;

export function Bind2faModal({ onClose, onEnabled }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const secret = useMemo(() => generateSecret(), []);
  const account = "user@ce.dev";
  const url = useMemo(() => otpauthUrl(secret, account), [secret]);

  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // 校验：集齐 6 位后自动触发
  useEffect(() => {
    const code = digits.join("");
    if (code.length !== CODE_LEN || verifying) return;
    let cancelled = false;
    setVerifying(true);
    setError(null);
    void verifyTotp(secret, code).then((ok) => {
      if (cancelled) return;
      setVerifying(false);
      if (ok) {
        toast.success(t("security.twofaEnabledToast"));
        onEnabled(secret);
      } else {
        setError(t("security.codeInvalid"));
        setDigits(Array(CODE_LEN).fill(""));
        inputsRef.current[0]?.focus();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [digits, secret, verifying, onEnabled, toast, t]);

  const setDigit = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = ch ?? "";
      return next;
    });
    if (ch && i < CODE_LEN - 1) inputsRef.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
      setDigits((prev) => prev.map((d, j) => (j === i - 1 ? "" : d)));
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    setDigits(text.padEnd(CODE_LEN, "").split("").slice(0, CODE_LEN));
    inputsRef.current[Math.min(text.length, CODE_LEN - 1)]?.focus();
  };

  return (
    <Modal title={t("security.twofaModalTitle")} onClose={onClose} width={440}>
      <div className="flex flex-col gap-4 p-1 text-sm">
        {/* 第一步 */}
        <p className="text-muted">{t("security.step1Download")}</p>

        {/* 第二步：二维码 + 密钥 */}
        <div>
          <p className="mb-2 text-muted">{t("security.step2Scan")}</p>
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-white p-2" data-testid="twofa-qrcode">
              <QRCode value={url} size={128} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-muted">{t("security.secretKey")}</p>
              <div className="flex items-center gap-2">
                <code
                  data-testid="twofa-secret"
                  className="block min-w-0 flex-1 break-all rounded-lg border border-border bg-panel-2/40 px-2 py-1.5 font-mono text-xs text-foreground"
                >
                  {secret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(secret);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? t("security.copied") : t("security.copy")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 防误删警示框 */}
        <div
          role="alert"
          className="rounded-lg border border-accent/30 bg-tag-bg px-3 py-2 text-xs leading-relaxed text-accent"
          data-testid="twofa-warning"
        >
          ⚠ {t("security.backupWarning")}
        </div>

        {/* 第三步：6 位验证码 */}
        <div>
          <p className="mb-2 text-muted">{t("security.step3Code")}</p>
          <div className="flex justify-between gap-2" onPaste={onPaste} data-testid="twofa-code">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={1}
                autoFocus={i === 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                className={cn(
                  "h-11 w-full rounded-lg border bg-background text-center font-mono text-lg tabular-nums text-foreground outline-none transition-colors focus:border-accent",
                  error ? "border-sell" : "border-border"
                )}
              />
            ))}
          </div>
          {(error || verifying) && (
            <p className={`mt-2 text-xs ${error ? "text-sell" : "text-muted"}`} role="alert">
              {error ?? t("security.verifying")}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
