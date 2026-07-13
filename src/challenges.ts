import type { Challenge, ChallengeIndex } from "./types";

const challengesUrl =
  import.meta.env.VITE_CHALLENGES_URL ??
  `${import.meta.env.BASE_URL}challenges.json`;

export async function loadChallenges(): Promise<Challenge[]> {
  const response = await fetch(challengesUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load challenges: ${response.status}`);
  }

  const index = (await response.json()) as ChallengeIndex;
  return [...index.challenges].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function todaysDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function findChallenge(
  challenges: Challenge[],
  date: string | undefined,
): Challenge | undefined {
  if (date) {
    return challenges.find((challenge) => challenge.date === date);
  }

  const today = todaysDate();
  return (
    challenges.find((challenge) => challenge.date === today) ?? challenges[0]
  );
}
