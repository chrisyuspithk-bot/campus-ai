"use client";
import { useState } from "react";
import type { YoutubeNotes } from "@/lib/studio/types";

const seconds = (t: string) => t.split(":").reduce((s, p) => s * 60 + (Number(p) || 0), 0);

export function YoutubeView({
  notes,
  copyright,
  openLabel,
  timelineLabel,
  basisLabel,
}: {
  notes: YoutubeNotes;
  copyright: string;
  openLabel: string;
  timelineLabel: string;
  basisLabel?: string;
}) {
  const [start, setStart] = useState<number | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${notes.videoId}${start === null ? "" : `?start=${start}&autoplay=1`}`}
            title={notes.title ?? "YouTube"}
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {(notes.title || basisLabel) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {notes.title && <span className="font-medium text-slate-700">{notes.title}{notes.channel ? ` · ${notes.channel}` : ""}</span>}
            {basisLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5" data-testid="yt-basis">{basisLabel}</span>}
          </div>
        )}
        <p className="whitespace-pre-line text-sm text-slate-700" data-testid="yt-summary">{notes.summary}</p>
        <p className="text-xs text-slate-500">{copyright}</p>
      </div>
      <ol className="card divide-y divide-slate-100 self-start" data-testid="yt-timeline" aria-label={timelineLabel}>
        <li className="p-3 text-sm font-semibold">{timelineLabel}</li>
        {notes.timeline.map((p, i) => (
          <li key={i} className="flex gap-3 p-3 text-sm">
            <a
              className="font-mono text-brand-700 hover:underline"
              href={`https://www.youtube.com/watch?v=${notes.videoId}&t=${seconds(p.t)}s`} target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                setStart(seconds(p.t));
              }}
            >
              {p.t}
            </a>
            <span>{p.point}</span>
          </li>
        ))}
        <li className="p-3 text-right text-sm">
          <a className="text-brand-700 hover:underline" href={notes.url} target="_blank" rel="noreferrer">{openLabel} ↗</a>
        </li>
      </ol>
    </div>
  );
}
