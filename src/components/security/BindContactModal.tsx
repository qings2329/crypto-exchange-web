// 手机/邮箱绑定弹窗（共用）：输入联系方式 → 发送验证码（演示码 toast 告知）→ 校验后绑定。
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { useToast } from "../Toast";

interface Props {
  kind: "phone" | "email";
  onClose: () => void;
  onBound: (value: string) => void;
}

const RESEND_SECONDS = 60;

export function BindContactModal({ kind, onClose, onBound }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const validInput =
    kind === "phone" ? /^1[3-9]\d{9}$/.test(value) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const send = () => {
    if (!validInput) {
      setError(t(kind === "phone" ? "security.invalidPhone" : "security.invalidEmail"));
      return;
    }
    setError(null);
    const demo = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(demo);
    setCountdown(RESEND_SECONDS);
    toast.info(t("security.demoCodeToast", { code: demo }));
  };

  const confirm = () => {
    if (sentCode && code === sentCode) {
      toast.success(t("security.bindSuccessToast"));
      onBound(kind === "phone" ? value : value.toLowerCase());
    } else {
      setError(t("security.codeInvalid"));
    }
  };

  return (
    <Modal
      title={t(kind === "phone" ? "security.phoneModalTitle" : "security.emailModalTitle")}
      onClose={onClose}
      width={400}
    >
      <div className="flex flex-col gap-3 p-1 text-sm">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t(kind === "phone" ? "security.phoneNumber" : "security.emailAddress")}
          <input
            data-testid={`contact-input`}
            type={kind === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.trim());
              setError(null);
            }}
            placeholder={kind === "phone" ? "13812345678" : "user@example.com"}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            {t("security.inputSmsCode")}
            <input
              data-testid="contact-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
            />
          </label>
          <Button variant="outline" size="default" disabled={countdown > 0} onClick={send} data-testid="contact-send">
            {countdown > 0 ? t("security.resendIn", { s: countdown }) : t("security.sendCode")}
          </Button>
        </div>

        {error && (
          <p className="text-xs text-sell" role="alert">
            {error}
          </p>
        )}

        <Button disabled={!sentCode || code.length !== 6} onClick={confirm} data-testid="contact-confirm">
          {t("security.bind")}
        </Button>
      </div>
    </Modal>
  );
}
