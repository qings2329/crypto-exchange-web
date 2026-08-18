import { useEffect, type ReactNode } from "react";
import { useI18n } from "../i18n";

// 通用弹窗：遮罩 + 标题栏 + 内容 + 底部操作区。
// 支持 Esc 关闭、点击遮罩关闭；通过 footer 传入操作按钮。
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 480,
  closeOnOverlay = true,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeOnOverlay?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
