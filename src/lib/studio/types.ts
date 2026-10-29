// Shared (client + server) shapes for studio outputs stored in library_items.data.

export type MindNode = { id: string; label: string; note?: string; children: MindNode[] };
export type Mindmap = { root: MindNode; positions?: Record<string, { x: number; y: number }> };

export type Flashcard = { front: string; back: string };
export type Flashcards = { cards: Flashcard[]; known?: number[]; unknown?: number[] };

export type QuizQuestion = { q: string; options: string[]; answer: number; explain: string };
export type Quiz = { questions: QuizQuestion[]; attempts?: { score: number; total: number; at: number }[] };

export type Worksheet = { markdown: string };

export type YoutubeNotes = {
  url: string;
  videoId: string;
  summary: string;
  timeline: { t: string; point: string }[];
  title?: string;
  channel?: string;
  /** Where the notes came from: auto-fetched captions, a pasted transcript, or metadata only. */
  basis?: "captions" | "pasted" | "metadata";
};

export const STUDIO_KINDS = ["mindmap", "flashcards", "quiz", "worksheet", "youtube"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export function walk(node: MindNode, fn: (n: MindNode, depth: number, parent?: MindNode) => void, depth = 0, parent?: MindNode) {
  fn(node, depth, parent);
  for (const c of node.children) walk(c, fn, depth + 1, node);
}

/** Mind map → flashcards: every node with a note (or children) becomes a card. No AI needed. */
export function mindmapToCards(m: Mindmap): Flashcard[] {
  const cards: Flashcard[] = [];
  walk(m.root, (n, depth) => {
    if (depth === 0) return;
    const back = n.note?.trim() || (n.children.length ? n.children.map((c) => c.label).join("、") : "");
    if (back) cards.push({ front: n.label, back });
  });
  return cards;
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
