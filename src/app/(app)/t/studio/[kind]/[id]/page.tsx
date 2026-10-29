import { StudioItemPage } from "@/components/studio/pages";
import { saveWorksheetAsDraft } from "../../actions";

export default async function TeacherStudioItem({ params }: PageProps<"/t/studio/[kind]/[id]">) {
  const { kind, id } = await params;
  return <StudioItemPage teacher kind={kind} id={id} saveAsDraft={saveWorksheetAsDraft} />;
}
