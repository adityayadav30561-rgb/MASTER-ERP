import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-slate-100 text-slate-700",
      good: "bg-green-100 text-green-800",
      warn: "bg-amber-100 text-amber-800",
      bad: "bg-red-100 text-red-800",
      info: "bg-brand-100 text-brand-900",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "active" ? "good" : status === "blocked" ? "bad" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
