// KYC 认证状态（本地持久化）：none → pending（已提交待审核）→ approved / rejected。
// 演示：提交 8 秒后自动「审核通过」（模拟后台回调）。
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KycStatus = "none" | "pending" | "approved" | "rejected";
export type IdDocType = "id_card" | "passport";

export interface KycDoc {
  name: string; // 原文件名
  size: number;
  previewUrl: string;
}

interface KycState {
  status: KycStatus;
  step: number; // 1 个人信息 / 2 证件上传 / 3 人脸识别
  fullName?: string;
  idType?: IdDocType;
  idNumber?: string;
  country?: string;
  front?: KycDoc;
  back?: KycDoc;
  submittedTs?: number;

  setInfo: (v: { fullName: string; idType: IdDocType; idNumber: string; country: string }) => void;
  setDocs: (docs: { front?: KycDoc; back?: KycDoc }) => void;
  nextStep: () => void;
  submit: () => void;
  approve: () => void;
  reject: () => void;
  reset: () => void;
}

export const useKycStore = create<KycState>()(
  persist(
    (set) => ({
      status: "none",
      step: 1,
      setInfo: (v) => set(v),
      setDocs: (docs) => set(docs),
      nextStep: () => set((s) => ({ step: Math.min(3, s.step + 1) })),
      submit: () => set({ status: "pending", submittedTs: Date.now() }),
      approve: () => set({ status: "approved" }),
      reject: () => set({ status: "rejected" }),
      reset: () => set({ status: "none", step: 1, front: undefined, back: undefined, submittedTs: undefined }),
    }),
    { name: "cx_kyc" }
  )
);
