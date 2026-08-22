// 敏感文本安全展示：打码 + DOM 篡改自检（防录屏场景配合隐私模式、防恶意改 DOM）。
// - mask：按 maskValue 打码展示；
// - guard：周期性比对渲染文本与期望值，被控制台/插件恶意修改时立即还原并上报事件。
import { useEffect, useRef, useState } from "react";
import { maskValue } from "../../lib/secure-utils";
import { cn } from "../../lib/utils";

interface Props {
  value: string;
  /** 打码展示（保留首尾各 leading/trailing 字符） */
  mask?: boolean;
  maskOpts?: { leading?: number; trailing?: number };
  /** 开启 DOM 篡改自检 */
  guard?: boolean;
  className?: string;
}

const CHECK_INTERVAL = 800;

export function SecureText({ value, mask = false, maskOpts, guard = true, className }: Props) {
  const expected = mask ? maskValue(value, maskOpts) : value;
  const ref = useRef<HTMLSpanElement>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!guard) return;
    let warned = false;
    const check = () => {
      const el = ref.current;
      if (!el) return;
      if (el.textContent !== expected) {
        // DOM 被外部篡改：立即还原 + 单次告警
        el.textContent = expected;
        setRestored(true);
        if (!warned) {
          warned = true;
          console.warn("[security] sensitive text tampered, restored:", expected);
          window.dispatchEvent(new CustomEvent("cx-security-tamper", { detail: { expected } }));
        }
      }
    };
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [expected, guard]);

  return (
    <span
      ref={ref}
      data-testid="secure-text"
      data-integrity={restored ? "restored" : "ok"}
      title={restored ? "DOM 篡改已还原" : undefined}
      className={cn("font-mono tabular-nums", restored && "text-sell", className)}
    >
      {expected}
    </span>
  );
}
