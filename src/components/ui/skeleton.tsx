import { cn } from "../../lib/utils";

/** 加载占位：面板色微光扫过动画。 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-panel-2",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
