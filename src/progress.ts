export type ValidationResult = "correct" | "incorrect";

export type ChallengeProgress = {
  cluesRevealed: number;
  selectedArtworkId?: string;
  validatedArtworkId?: string;
  validationResult?: ValidationResult;
};

const STORAGE_KEY = "daily-art.challenge-progress.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProgress(value: unknown): ChallengeProgress | undefined {
  if (!isRecord(value) || typeof value.cluesRevealed !== "number") {
    return undefined;
  }

  const progress: ChallengeProgress = {
    cluesRevealed: Math.max(1, Math.floor(value.cluesRevealed)),
  };

  if (typeof value.selectedArtworkId === "string") {
    progress.selectedArtworkId = value.selectedArtworkId;
  }

  if (typeof value.validatedArtworkId === "string") {
    progress.validatedArtworkId = value.validatedArtworkId;
  }

  if (value.validationResult === "correct" || value.validationResult === "incorrect") {
    progress.validationResult = value.validationResult;
  }

  return progress;
}

function loadProgressIndex(): Record<string, ChallengeProgress> {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
      return {};
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!isRecord(parsedValue)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedValue).flatMap(([date, value]) => {
        const progress = parseProgress(value);
        return progress ? [[date, progress]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function loadChallengeProgress(date: string): ChallengeProgress | undefined {
  return loadProgressIndex()[date];
}

export function saveChallengeProgress(date: string, progress: ChallengeProgress): void {
  try {
    const progressIndex = loadProgressIndex();
    progressIndex[date] = progress;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progressIndex));
  } catch {
    // The game remains usable when storage is blocked or unavailable.
  }
}

export function clearChallengeProgress(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The game remains usable when storage is blocked or unavailable.
  }
}
