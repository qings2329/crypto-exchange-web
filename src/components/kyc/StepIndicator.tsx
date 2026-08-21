// KYC 步骤条：完成=绿勾，当前=品牌黄高亮，未到=灰。
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

const STEPS = ["kyc.step1", "kyc.step2", "kyc.step3"] as const;

export function StepIndicator({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <ol className="flex items-center" data-testid="kyc-steps">
      {STEPS.map((key, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-xs font-bold transition-colors",
                  done && "border-buy bg-buy text-black",
                  active && "border-accent bg-tag-bg text-accent",
                  !done && !active && "border-border bg-panel-2 text-muted"
                )}
                data-testid={`kyc-step-${n}`}
              >
                {done ? "✓" : n}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-xs font-medium",
                  active ? "text-foreground" : "text-muted",
                  done && "text-buy"
                )}
              >
                {t(key)}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={cn("mx-3 h-px flex-1", done ? "bg-buy" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
