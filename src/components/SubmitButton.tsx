"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** Primary submit button with pending spinner and a brief "saved" confirmation. */
export function SubmitButton({ children, className = "btn btn-primary", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const { t } = useT();
  const [done, setDone] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) {
      setDone(true);
      const h = setTimeout(() => setDone(false), 1500);
      was.current = false;
      return () => clearTimeout(h);
    }
    was.current = pending;
  }, [pending]);
  return (
    <button className={className} disabled={pending} name={name} value={value}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : null}
      {done ? t("common.saved") : children}
    </button>
  );
}
