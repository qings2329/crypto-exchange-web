// 安全中心（/security）：2FA / 手机 / 邮箱 / 防钓鱼码 四项安全配置。
// - 每项一行：图标 + 名称/描述 + 状态 + 开关或绑定按钮；
// - 2FA 关闭需 Confirm 二次确认；解绑同理。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { useSecurityStore, maskPhone } from "../store/security-store";
import { Switch } from "../components/security/Switch";
import { Bind2faModal } from "../components/security/Bind2faModal";
import { BindContactModal } from "../components/security/BindContactModal";
import { AntiPhishingModal } from "../components/security/AntiPhishingModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useConfirm } from "../components/Confirm";
import { useSecureAction } from "../components/security/SecureActionProvider";
import { useToast } from "../components/Toast";

type ModalKind = "twofa" | "phone" | "email" | "antiphishing" | null;

export function SecurityCenter() {
  const { t } = useTranslation();
  const { uid } = useAuth();
  const confirm = useConfirm();
  const secureAction = useSecureAction();
  const toast = useToast();
  const sec = useSecurityStore();
  const [modal, setModal] = useState<ModalKind>(null);

  const items = [
    {
      key: "twofa",
      icon: "🛡",
      title: t("security.twofa"),
      desc: t("security.twofa.desc"),
      on: sec.twofaEnabled,
      statusText: sec.twofaEnabled ? t("security.statusOn") : t("security.statusOff"),
    },
    {
      key: "phone",
      icon: "📱",
      title: t("security.phone"),
      desc: t("security.phone.desc"),
      on: !!sec.phone,
      statusText: sec.phone ? `${t("security.bound")} · ${maskPhone(sec.phone)}` : t("security.notBound"),
    },
    {
      key: "email",
      icon: "✉️",
      title: t("security.email"),
      desc: t("security.email.desc"),
      on: !!sec.email,
      statusText: sec.email ? `${t("security.bound")} · ${sec.email}` : t("security.notBound"),
    },
    {
      key: "antiphishing",
      icon: "🎣",
      title: t("security.antiPhishing"),
      desc: t("security.antiPhishing.desc"),
      on: !!sec.antiPhishingCode,
      statusText: sec.antiPhishingCode ?? t("security.notBound"),
    },
  ] as const;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold">{t("security.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("security.subtitle")}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="security-list">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={`flex items-center gap-4 px-4 py-4 ${i > 0 ? "border-t border-border" : ""}`}
            data-testid={`security-item-${item.key}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-panel-2 text-lg">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{item.desc}</p>
            </div>
            <Badge variant={item.on ? "success" : "default"}>{item.statusText}</Badge>
            {item.key === "twofa" ? (
              <Switch
                testid="twofa-switch"
                checked={item.on}
                onChange={(v) => {
                  if (v) setModal("twofa");
                  else
                    void confirm({ message: t("security.confirmDisableTwofa"), danger: true }).then(async (ok) => {
                      if (!ok) return;
                      // 高危操作拦截：解绑 2FA 需滑块 + 二次验证码
                      const verified = await secureAction.verify({ action: "unbind2fa" });
                      if (!verified) return;
                      sec.disableTwofa();
                      toast.info(t("security.twofaDisabledToast"));
                    });
                }}
              />
            ) : item.on ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void confirm({ message: t("security.unbindConfirm"), danger: true }).then((ok) => {
                    if (!ok) return;
                    if (item.key === "phone") sec.unbindPhone();
                    if (item.key === "email") sec.unbindEmail();
                    if (item.key === "antiphishing") sec.setAntiPhishingCode("");
                  });
                }}
              >
                {t("security.unbind")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setModal(item.key as Exclude<ModalKind, null>)}>
                {t("security.bind")}
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">UID: {uid ?? "-"}</p>

      {modal === "twofa" && (
        <Bind2faModal
          onClose={() => setModal(null)}
          onEnabled={(secret) => {
            sec.enableTwofa(secret);
            setModal(null);
          }}
        />
      )}
      {(modal === "phone" || modal === "email") && (
        <BindContactModal
          kind={modal}
          onClose={() => setModal(null)}
          onBound={(v) => {
            if (modal === "phone") sec.bindPhone(v);
            else sec.bindEmail(v);
            setModal(null);
          }}
        />
      )}
      {modal === "antiphishing" && (
        <AntiPhishingModal
          current={sec.antiPhishingCode}
          onClose={() => setModal(null)}
          onSaved={(code) => {
            sec.setAntiPhishingCode(code);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
