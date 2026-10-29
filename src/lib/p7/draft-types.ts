// Draft types (P1 teaching drafts + P7 admin/pastoral documents). Plain module so client components can import it.
export const DRAFT_TYPES = ["worksheet", "outline", "quiz", "notes", "report_card", "notice", "progress_report"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];
