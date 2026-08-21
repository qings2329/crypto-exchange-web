// 防钓鱼码设置弹窗：4-20 位字母/数字，保存后显示在安全中心列表。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { useToast } from "../Toast";

interface Props {
  current?: string;
  onClose: () => void;
  onSaved: (code: string) => void;
}

export function AntiPhishingModal({ current, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const valid = /^[A-Za-z0-9]{4,20}$/.test(value);

  return (
    <Modal title={t("security.apModalTitle")} onClose={onClose} width={400}>
      <div className="flex flex-col gap-3 p-1 text-sm">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("security.antiPhishing")}
          <input
            data-testid="ap-input"
            value={value}
            maxLength={20}
            onChange={(e) => {
              setValue(e.target.value.trim());
              setError(null);
            }}
            placeholder={t("security.apInputPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-accent"
          />
        </label>
        <p className="text-xs leading-relaxed text-muted">{t("security.antiPhishing.desc")}</p>
        {error && (
          <p className="text-xs text-sell" role="alert">
            {error}
          </p>
        )}
        <Button
          data-testid="ap-save"
          onClick={() => {
            if (!valid) {
              setError(t("security.invalidApCode"));
              return;
            }
            toast.success(t("security.apSavedToast"));
            onSaved(value);
          }}
        >
          {t("security.bind")}
        </Button>
      </div>
    </Modal>
  );
}
