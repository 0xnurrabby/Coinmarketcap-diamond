"use client";

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-primary text-white hover:bg-primary-active border border-primary",
    secondary:
      "bg-canvas text-ink border border-hairline hover:border-border-strong",
    ghost: "bg-transparent text-ink hover:bg-surface-strong/50 border border-transparent",
    danger: "bg-canvas text-error border border-hairline hover:border-error",
  };
  return (
    <button
      className={`inline-flex items-center justify-center h-10 px-4 rounded-full text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-11 px-3 rounded-lg border border-hairline bg-canvas text-ink placeholder:text-border-strong focus:outline-none focus:border-ink ${className}`}
      {...props}
    />
  );
}

export function PasswordInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative w-full">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={`w-full h-11 pl-3 pr-11 rounded-lg border border-hairline bg-canvas text-ink placeholder:text-border-strong focus:outline-none focus:border-ink ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-soft cursor-pointer"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full min-h-28 p-3 rounded-lg border border-hairline bg-canvas text-ink placeholder:text-border-strong focus:outline-none focus:border-ink ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-canvas border border-hairline rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const map = {
    ok: "bg-green-50 text-success border-success-border/40",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-error border-red-200",
    neutral: "bg-surface-soft text-muted border-hairline",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-canvas border border-hairline rounded-2xl p-6 shadow-xl animate-pop-in">
        <h2 className="text-lg font-medium text-ink mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
