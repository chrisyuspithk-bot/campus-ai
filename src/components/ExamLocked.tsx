import Link from "next/link";
import { Lock } from "lucide-react";
import { getT } from "@/lib/i18n/server";

/** Shown instead of /ai while the student sits an AI-locked exam (deep links are intercepted too). */
export async function ExamLocked({ assignmentId }: { assignmentId: string }) {
  const { t } = await getT();
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="card max-w-md p-8 text-center" data-testid="exam-locked">
        <Lock className="mx-auto mb-3 h-10 w-10 text-rose-400" aria-hidden />
        <h1 className="text-xl font-semibold">{t("p3.examLockedTitle")}</h1>
        <p className="mt-2 text-slate-600">{t("p3.err.examLocked")}</p>
        <Link href={`/s/assignments/${assignmentId}/attempt`} className="btn btn-primary mt-6">{t("p3.backToExam")}</Link>
      </div>
    </div>
  );
}
