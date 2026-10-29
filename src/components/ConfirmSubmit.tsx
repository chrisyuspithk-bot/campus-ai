"use client";

/** Submit button that asks for confirmation first (destructive form actions). */
export function ConfirmSubmit({ message, className = "btn btn-danger", children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
