/** The release phase this build ships. Nav items / features with phase > CURRENT_PHASE stay locked (gray "Px"). */
export const CURRENT_PHASE = 8;

export function isUnlocked(phase: number) {
  return phase <= CURRENT_PHASE;
}
