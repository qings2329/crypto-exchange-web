// 证件拖拽上传区：拖拽/点击选择 → 格式与大小校验 → 本地预览。
// 校验逻辑抽为纯函数 validateDoc 便于单测；预览 URL 由父级持有（store），卸载不主动 revoke（持久化展示）。
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { KycDoc } from "../../store/kyc-store";

export const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateDoc(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "format";
  if (file.size > MAX_DOC_SIZE) return "size";
  return null;
}

interface Props {
  label: string;
  doc?: KycDoc;
  onSelect: (doc: KycDoc) => void;
}

export function DocUpload({ label, doc, onSelect }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const err = validateDoc(file);
    if (err) {
      setError(t(err === "format" ? "kyc.errFormat" : "kyc.errSize"));
      return;
    }
    setError(null);
    onSelect({ name: file.name, size: file.size, previewUrl: URL.createObjectURL(file) });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div
        role="button"
        tabIndex={0}
        data-testid={`doc-dropzone`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          "relative grid h-36 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed transition-colors",
          dragOver ? "border-accent bg-tag-bg/40" : "border-border bg-panel-2/20 hover:border-accent/50"
        )}
      >
        {doc ? (
          <>
            <img src={doc.previewUrl} alt={label} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-[11px] text-white">
              <span className="truncate">{doc.name}</span>
              <span className="shrink-0 text-accent">{t("kyc.reupload")}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 p-3 text-center">
            <span className="text-2xl">🖼</span>
            <span className="text-xs text-muted">{t("kyc.dragHere")}</span>
            <span className="text-[11px] text-muted/70">{t("kyc.formatsHint")}</span>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-sell" role="alert">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid={`doc-input`}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
