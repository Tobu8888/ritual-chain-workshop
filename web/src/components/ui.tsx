"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { TxState } from "@/hooks/useWriteTx";

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-black/50 backdrop-blur shadow-xl shadow-[#8840ff]/10 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

/* ----------------------------------------------------------------- Badge */

type Tone = "green" | "amber" | "indigo" | "zinc" | "red";

const TONES: Record<Tone, string> = {
  green: "bg-[#40ffaf]/12 text-[#40ffaf] ring-[#40ffaf]/40",
  amber: "bg-[#f6be4f]/12 text-[#f6be4f] ring-[#f6be4f]/40",
  indigo: "bg-[#8840ff]/18 text-[#c4a0ff] ring-[#8840ff]/45",
  zinc: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  red: "bg-[#ff5757]/12 text-[#ff5757] ring-[#ff5757]/40",
};

export function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const styles: Record<string, string> = {
    primary:
      "bg-[#40ffaf] text-black font-semibold hover:bg-[#5effc0] shadow-[0_0_20px_rgba(64,255,175,0.35)] hover:shadow-[0_0_30px_rgba(64,255,175,0.55)] disabled:bg-[#40ffaf]/25 disabled:shadow-none",
    secondary:
      "bg-white/5 text-zinc-100 ring-1 ring-inset ring-white/15 hover:bg-white/10 hover:ring-[#00c2ff]/40 disabled:bg-white/5",
    ghost: "bg-transparent text-zinc-300 hover:bg-white/5",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-zinc-400 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------- Form fields */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#00c2ff]/60 focus:outline-none focus:ring-1 focus:ring-[#00c2ff]/40";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${inputBase} resize-y ${props.className ?? ""}`}
    />
  );
}

/* ---------------------------------------------------------- Tx status UI */

const TX_LABEL: Record<TxState, string> = {
  idle: "",
  wallet: "Waiting for wallet…",
  pending: "Confirming on-chain…",
  confirmed: "Confirmed",
  failed: "Failed",
};

const TX_TONE: Record<TxState, Tone> = {
  idle: "zinc",
  wallet: "amber",
  pending: "indigo",
  confirmed: "green",
  failed: "red",
};

export function TxStatus({
  state,
  error,
  hash,
  explorerBase,
}: {
  state: TxState;
  error?: string | null;
  hash?: `0x${string}`;
  explorerBase?: string;
}) {
  if (state === "idle" && !error) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={TX_TONE[state]}>
        {(state === "wallet" || state === "pending") && <Spinner />}
        {state === "failed" && error ? error : TX_LABEL[state]}
      </Badge>
      {hash && explorerBase ? (
        <a
          href={`${explorerBase}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00c2ff] hover:text-[#5ad6ff] underline underline-offset-2"
        >
          View tx
        </a>
      ) : null}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function Notice({
  tone = "zinc",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 text-xs ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-zinc-100 break-words">
        {value}
      </div>
    </div>
  );
}
