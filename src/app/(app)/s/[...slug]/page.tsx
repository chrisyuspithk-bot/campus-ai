import { LockedPage } from "@/components/LockedPage";

export default async function Locked({ params }: PageProps<"/s/[...slug]">) {
  const { slug } = await params;
  return <LockedPage path={`/s/${slug.join("/")}`} />;
}
