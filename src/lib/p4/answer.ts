// Pure answer checking shared by the server marker and the client wrongbook redo.

export function normAnswer(s: string) {
  return s.replace(/\s+/g, "").replace(/[，,。.]/g, "").toLowerCase();
}

/** MC: option index as a string. Short: any of the "|"-separated accepted answers. Long/upload: not auto-checkable. */
export function checkAnswer(type: string, answer: string, given: string): boolean | null {
  const g = given.trim();
  if (type === "mc") return g !== "" && g === answer;
  if (type === "short") return g !== "" && answer.split("|").some((acc) => normAnswer(acc) === normAnswer(g));
  return null;
}
