import { LockedPage } from "@/components/LockedPage";

export default async function Locked({ params }: PageProps<"/a/[...slug]">) {
  const { slug } = await params;
  return <LockedPage path={`/a/${slug.join("/")}`} />;
}
