"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page every `seconds` (live monitor views). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const h = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(h);
  }, [router, seconds]);
  return null;
}
