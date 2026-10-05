import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const styles: Record<string, string> = {
    IN_FORCE: "bg-jade-100 text-jade-600 border-jade-600/30",
    AMENDED: "bg-gold-100 text-gold-600 border-gold-600/30",
    REPEALED: "bg-clay-100 text-clay-600 border-clay-600/30",
    SUPERSEDED: "bg-clay-100/60 text-clay-600 border-clay-600/25",
    HISTORICAL: "bg-ink-100 text-ink-600 border-ink-300",
    UNKNOWN: "bg-ink-50 text-ink-400 border-ink-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide",
        styles[status] ?? styles.UNKNOWN,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function LangBadge({ language, className }: { language: string; className?: string }) {
  const label = language === "am" ? "አማርኛ" : language === "en" ? "English" : "A|En";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-600",
        language === "am" && "ethiopic",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function Card({
  children,
  className,
  hover,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "paper-card rounded-xl",
        hover && "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-brass-500/50 hover:shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-ink-900 text-paper-50 hover:bg-ink-800 border border-ink-900",
    ghost: "bg-transparent text-ink-600 hover:bg-ink-100/70 border border-transparent",
    outline: "bg-paper-50 text-ink-800 border border-ink-200 hover:border-brass-500/60",
    danger: "bg-clay-600 text-white hover:bg-clay-600/90 border border-clay-600",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full appearance-none rounded-lg border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-[13px] text-ink-800 outline-none transition-colors focus:border-brass-500",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ConfidenceBadge({ level, label }: { level: "STRONG" | "MODERATE" | "INSUFFICIENT"; label: string }) {
  const styles = {
    STRONG: "bg-jade-100 text-jade-600 border-jade-600/30",
    MODERATE: "bg-gold-100 text-gold-600 border-gold-600/30",
    INSUFFICIENT: "bg-clay-100 text-clay-600 border-clay-600/30",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", styles[level])}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
