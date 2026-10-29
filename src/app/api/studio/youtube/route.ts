import { runStructured } from "@/lib/ai/run";
import { mockYoutube, normalizeYoutube, youtubePrompt, type YoutubeContext } from "@/lib/ai/studio";
import { featuresFor } from "@/lib/features";
import { createLibraryItem } from "@/lib/library";
import { aiFail, studioBase, studioUser } from "@/lib/studio/server";
import { youtubeId } from "@/lib/studio/types";
import { captionsToTranscript, fetchYoutubeInfo } from "@/lib/studio/youtube";

/**
 * Video link (+ optional pasted transcript) → summary + timeline. Behind the `youtube` feature switch.
 * URL-only works: captions/metadata are fetched server-side; without either the model (or demo mock) still answers.
 */
export async function POST(req: Request) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  if (!featuresFor(user.role).youtube) return Response.json({ error: "feature_off" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; transcript?: string; title?: string };
  const url = (body.url ?? "").trim();
  const videoId = youtubeId(url);
  if (!videoId) return Response.json({ error: "bad_url" }, { status: 400 });

  const pasted = (body.transcript ?? "").trim().slice(0, 30_000);
  const info = await fetchYoutubeInfo(videoId, req.signal);
  const captions = pasted ? "" : captionsToTranscript(info.captions);
  const ctx: YoutubeContext = {
    title: info.title,
    channel: info.author,
    description: info.description,
    lengthSeconds: info.lengthSeconds,
    transcript: pasted || captions,
    basis: pasted ? "pasted" : captions ? "captions" : "metadata",
  };
  const { system, prompt } = youtubePrompt(url, ctx);
  const mock = () => mockYoutube(url, videoId, ctx);
  const res = await runStructured({
    user,
    source: "studio",
    input: `${url}\n${info.title ?? ""}\n${pasted}`,
    system,
    prompt,
    normalize: (raw) => normalizeYoutube(raw, url, videoId),
    mock,
    signal: req.signal,
  });
  // A flaky upstream / unparseable answer shouldn't lose the student's request: fall back to demo notes.
  const recoverable = !res.ok && (res.error === "upstream" || res.error === "bad_output") && !req.signal.aborted;
  if (!res.ok && !recoverable) return aiFail(res.error, res.message);

  const notes = res.ok ? res.value : mock();
  const data = { ...notes, title: info.title, channel: info.author, basis: ctx.basis };
  const title = (body.title ?? "").trim() || info.title?.slice(0, 120) || `YouTube · ${videoId}`;
  const id = createLibraryItem({ ownerId: user.id, kind: "youtube", source: "studio", title, data, text: ctx.transcript });
  return Response.json({ id, href: `${studioBase(user)}/youtube/${id}` });
}
