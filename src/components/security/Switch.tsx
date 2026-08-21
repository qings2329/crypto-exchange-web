// 开关（币安风格）：开启=品牌黄，关闭=面板灰。
export function Switch({
  checked,
  onChange,
  disabled,
  testid,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-testid={testid}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-panel-2"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
