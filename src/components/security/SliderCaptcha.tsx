// 滑块验证码（演示版 Turnstile 风格）：按住滑块拖到最右侧通过校验。
// 通过后产出一次性 token（FNV 哈希）供父级使用；失败/未达阈值自动回弹。
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fnv1a } from "../../lib/secure-utils";
import { cn } from "../../lib/utils";

interface Props {
  /** 校验通过回调（携带一次性 token） */
  onPass: (token: string) => void;
}

const HANDLE = 44; // 滑块宽度 px

export function SliderCaptcha({ onPass }: Props) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const passed = progress >= 0.99;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  const move = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el || startXRef.current == null) return;
    const max = el.clientWidth - HANDLE;
    setProgress(clamp01((clientX - startXRef.current) / max));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (passed) return;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 从滑块中心开始拖拽，避免跳变
    startXRef.current = e.clientX - rect.left - (HANDLE / 2 + progress * (rect.width - HANDLE));
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    move(e.clientX);
  };

  const finish = () => {
    if (!dragging) return;
    setDragging(false);
    startXRef.current = null;
    if (progress >= 0.99) {
      onPass(fnv1a(`captcha:${Date.now()}:${Math.random()}`));
      setProgress(1);
    } else {
      setProgress(0); // 未达阈值回弹
    }
  };

  return (
    <div className="select-none" data-testid="captcha-root">
      <div
        ref={trackRef}
        data-testid="captcha-track"
        className={cn(
          "relative h-11 w-full overflow-hidden rounded-lg border transition-colors",
          passed ? "border-buy/50 bg-buy/10" : "border-border bg-panel-2/40"
        )}
      >
        {/* 进度填充 */}
        <div
          className={cn("absolute inset-y-0 left-0 transition-colors", passed ? "bg-buy/20" : "bg-accent/10")}
          style={{ width: `calc(${HANDLE}px + ${progress} * (100% - ${HANDLE}px))` }}
        />
        {/* 提示文案 */}
        {!passed && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted">
            {t("security.captchaHint")}
          </span>
        )}
        {passed && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-semibold text-buy" data-testid="captcha-passed">
            ✓ {t("security.captchaPassed")}
          </span>
        )}
        {/* 滑块 */}
        <div
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          data-testid="captcha-handle"
          className={cn(
            "absolute top-0 grid h-11 cursor-grab place-items-center rounded-lg border text-muted transition-colors active:cursor-grabbing",
            passed ? "border-buy bg-buy text-black" : "border-border bg-card hover:border-accent"
          )}
          style={{
            width: HANDLE,
            left: `calc(${progress} * (100% - ${HANDLE}px))`,
            touchAction: "none",
          }}
        >
          {passed ? "✓" : "»›"}
        </div>
      </div>
    </div>
  );
}
