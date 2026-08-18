import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";

export interface ConfirmOptions {
  title?: ReactNode;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));

interface State extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

// 包裹应用，提供全局 confirm()。在任意组件内用 useConfirm() 取得。
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const { t } = useI18n();

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  }, []);

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title ?? t("confirm.title")}
          onClose={() => close(false)}
          width={400}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>
                {state.cancelText ?? t("common.cancel")}
              </button>
              <button
                className={state.danger ? "btn danger" : "btn primary"}
                onClick={() => close(true)}
              >
                {state.confirmText ?? t("common.confirm")}
              </button>
            </>
          }
        >
          <p className="confirm-msg">{state.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx);
}
