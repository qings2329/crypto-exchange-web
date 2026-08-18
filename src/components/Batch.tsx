import { useState } from "react";
import { useI18n } from "../i18n";

// 单个批量动作。run 接收选中的 id 列表，返回 Promise 以便调用方在完成后刷新。
export interface BatchAction {
  key: string;
  label: string;
  danger?: boolean;
  run: (ids: (string | number)[]) => Promise<void> | void;
}

// 行选择状态：可在 ApiTable 或自定义表格中复用，避免重复实现勾选逻辑。
export function useSelection<T extends string | number>(allIds: T[]) {
  const [selected, setSelected] = useState<Set<T>>(new Set());
  const toggle = (id: T) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => (s.size === allIds.length ? new Set<T>() : new Set(allIds)));
  const clear = () => setSelected(new Set<T>());
  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  return { selected, toggle, toggleAll, clear, allSelected };
}

// 批量操作栏：选中数 > 0 时展示，点击动作后由 onRun 统一处理（含 loading/刷新）。
export function BatchBar({
  ids,
  actions,
  onClear,
  busy,
  onRun,
}: {
  ids: (string | number)[];
  actions: BatchAction[];
  onClear: () => void;
  busy?: boolean;
  onRun: (action: BatchAction) => void;
}) {
  const { t } = useI18n();
  if (ids.length === 0) return null;
  return (
    <div className="batch-bar">
      <span className="muted">{t("common.selected", { n: ids.length })}</span>
      {actions.map((a) => (
        <button
          key={a.key}
          className={a.danger ? "btn danger" : "btn"}
          disabled={busy}
          onClick={() => onRun(a)}
        >
          {a.label}
        </button>
      ))}
      <button className="btn" disabled={busy} onClick={onClear}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
