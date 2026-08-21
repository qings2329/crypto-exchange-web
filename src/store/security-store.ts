// 安全中心状态（本地持久化，模拟后端账户安全配置）。
// - 2FA：绑定后存 secret（演示用途；真实场景 secret 只存服务端）；
// - 手机/邮箱：绑定后存掩码号；防钓鱼码：4-20 位字符。
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SecurityState {
  twofaEnabled: boolean;
  twofaSecret?: string;
  phone?: string; // 掩码：138****1234
  email?: string;
  antiPhishingCode?: string;

  enableTwofa: (secret: string) => void;
  disableTwofa: () => void;
  bindPhone: (masked: string) => void;
  unbindPhone: () => void;
  bindEmail: (email: string) => void;
  unbindEmail: () => void;
  setAntiPhishingCode: (code: string) => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set) => ({
      twofaEnabled: false,
      enableTwofa: (secret) => set({ twofaEnabled: true, twofaSecret: secret }),
      disableTwofa: () => set({ twofaEnabled: false, twofaSecret: undefined }),
      bindPhone: (phone) => set({ phone }),
      unbindPhone: () => set({ phone: undefined }),
      bindEmail: (email) => set({ email }),
      unbindEmail: () => set({ email: undefined }),
      setAntiPhishingCode: (antiPhishingCode) => set({ antiPhishingCode }),
    }),
    { name: "cx_security" }
  )
);

/** 手机号掩码：138****1234 */
export function maskPhone(p: string): string {
  return p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p;
}
