import { StudioItemPage } from "@/components/studio/pages";

export default async function StudentStudioItem({ params }: PageProps<"/s/studio/[kind]/[id]">) {
  const { kind, id } = await params;
  return <StudioItemPage teacher={false} kind={kind} id={id} />;
}
