import { Sparkles } from "lucide-react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-8 w-8 rounded-lg";
  const icon = size === "lg" ? "h-7 w-7" : "h-4.5 w-4.5";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${box} grid place-items-center bg-gradient-to-br from-brand-500 to-teal-500 text-white shadow-sm`}>
        <Sparkles className={icon} aria-hidden />
      </span>
      <span className={`${size === "lg" ? "text-3xl" : "text-lg"} font-bold tracking-tight text-slate-900`}>
        Campus <span className="text-brand-600">AI</span>
      </span>
    </span>
  );
}
