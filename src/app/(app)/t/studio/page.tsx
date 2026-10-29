import type { Metadata } from "next";
import { StudioIndexPage } from "@/components/studio/pages";

export const metadata: Metadata = { title: "教材工作室" };

export default async function TeacherStudio({ searchParams }: PageProps<"/t/studio">) {
  const { item } = await searchParams;
  return <StudioIndexPage teacher item={typeof item === "string" ? item : undefined} />;
}
