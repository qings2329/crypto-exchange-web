// KYC 向导草稿（本地持久化）：仅保存分步表单与证件预览。
// 认证状态机（none/pending/approved/rejected）由服务端 /api/v1/user/kyc 驱动，不再落本地。
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type IdDocType = "id_card" | "passport";

export interface KycDoc {
  name: string; // 原文件名
  size: number;
  previewUrl: string;
}

interface KycState {
  step: number; // 1 个人信息 / 2 证件上传 / 3 人脸识别
  fullName?: string;
  idType?: IdDocType;
  idNumber?: string;
  country?: string;
  front?: KycDoc;
  back?: KycDoc;

  setInfo: (v: { fullName: string; idType: IdDocType; idNumber: string; country: string }) => void;
  setDocs: (docs: { front?: KycDoc; back?: KycDoc }) => void;
  nextStep: () => void;
  gotoStep: (n: number) => void;
  clearDocs: () => void;
}

export const useKycStore = create<KycState>()(
  persist(
    (set) => ({
      step: 1,
      setInfo: (v) => set(v),
      setDocs: (docs) => set(docs),
      nextStep: () => set((s) => ({ step: Math.min(3, s.step + 1) })),
      gotoStep: (n) => set({ step: n }),
      clearDocs: () => set({ front: undefined, back: undefined }),
    }),
    { name: "cx_kyc_draft" }
  )
);
