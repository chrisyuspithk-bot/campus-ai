import { LockedPage } from "@/components/LockedPage";

export default async function Locked({ params }: PageProps<"/t/[...slug]">) {
  const { slug } = await params;
  return <LockedPage path={`/t/${slug.join("/")}`} />;
}
