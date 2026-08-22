// 手机/邮箱绑定弹窗（共用）：输入联系方式 → 发送验证码（演示码 toast 告知）→ 校验后绑定。
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { useToast } from "../Toast";
import { useGuardedAction } from "../../hooks/use-guarded-action";

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
  const [error, setError] = useState<string | null>(null);

  const validInput =
    kind === "phone" ? /^1[3-9]\d{9}$/.test(value) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // 发送验证码：300ms 防抖 + 60s 接口冷却（同 key 跨弹窗实例共享，防轰炸）
  const sendCode = useGuardedAction(
    () => {
      if (!validInputRef.current) {
        setError(t(kind === "phone" ? "security.invalidPhone" : "security.invalidEmail"));
        return;
      }
      setError(null);
      const demo = String(Math.floor(100000 + Math.random() * 900000));
      setSentCode(demo);
      toast.info(t("security.demoCodeToast", { code: demo }));
    },
    { key: `send-contact-code:${kind}`, cooldownMs: RESEND_SECONDS * 1000, debounceMs: 300 }
  );
  const validInputRef = useRef(validInput);
  validInputRef.current = validInput;
  const countdown = Math.ceil(sendCode.remainingMs / 1000);

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
          <Button variant="outline" size="default" disabled={sendCode.cooling} onClick={() => sendCode.run()} data-testid="contact-send">
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
