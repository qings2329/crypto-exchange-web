// 敏感操作拦截器：全局挂载，useSecureAction() 触发二次验证弹窗。
// 用法：const sa = useSecureAction();
//      sa.verify({ action: "withdraw" }).then((ok) => ok && doWithdraw());
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { SecurityVerifyModal, type SensitiveAction } from "./SecurityVerifyModal";

interface VerifyRequest {
  action: SensitiveAction;
  resolve: (ok: boolean) => void;
}

const SecureActionCtx = createContext<{ verify: (req: { action: SensitiveAction }) => Promise<boolean> }>({
  verify: () => Promise.resolve(false),
});

export function SecureActionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<VerifyRequest | null>(null);
  const seq = useRef(0);

  const verify = useCallback((req: { action: SensitiveAction }) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ action: req.action, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (ok: boolean) => {
      request?.resolve(ok);
      setRequest(null);
      seq.current += 1; // 每次重新打开都是全新弹窗状态
    },
    [request]
  );

  const value = useMemo(() => ({ verify }), [verify]);

  return (
    <SecureActionCtx.Provider value={value}>
      {children}
      {request && (
        <SecurityVerifyModal
          key={`${request.action}-${seq.current}`}
          action={request.action}
          onClose={handleClose}
        />
      )}
    </SecureActionCtx.Provider>
  );
}

export function useSecureAction() {
  return useContext(SecureActionCtx);
}
