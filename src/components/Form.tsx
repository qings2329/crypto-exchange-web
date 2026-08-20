import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// 表单字段容器：统一 label / 错误信息 / 布局。
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  id,
  ...rest
}: { label?: ReactNode; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <input id={id} className="form-input" {...rest} />
    </FormField>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  id,
  ...rest
}: { label?: ReactNode; error?: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <textarea id={id} className="form-textarea" {...rest} />
    </FormField>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  children,
  ...rest
}: { label?: ReactNode; error?: string; hint?: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <select id={id} className="form-select" {...rest}>
        {children}
      </select>
    </FormField>
  );
}

export function CheckboxField({
  label,
  error,
  id,
  children,
  ...rest
}: { label?: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <label className="form-check">
        <input id={id} type="checkbox" {...rest} />
        <span>{children}</span>
      </label>
    </FormField>
  );
}
