import type { Metadata } from "next";
import { StudioIndexPage } from "@/components/studio/pages";

export const metadata: Metadata = { title: "學習工作室" };

export default async function StudentStudio({ searchParams }: PageProps<"/s/studio">) {
  const { item } = await searchParams;
  return <StudioIndexPage teacher={false} item={typeof item === "string" ? item : undefined} />;
}
