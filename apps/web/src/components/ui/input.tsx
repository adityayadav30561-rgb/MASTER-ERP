import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 aria-[invalid=true]:border-red-600", className)} {...props} />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm aria-[invalid=true]:border-red-600", className)} {...props} />
));
Select.displayName = "Select";
