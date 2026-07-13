import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Artwork, Challenge, ChallengeIndex } from "../src/types";
import {queryArtwork, queryArtworkCount, queryArtworkList} from "./rijksmuseum-api.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const challengePath = path.join(root, "public", "challenges.json");

function dateStamp(): string {
  return process.env.CHALLENGE_DATE ?? new Date().toISOString().slice(0, 10);
}

function seedFromDate(date: string, purpose: string): number {
  return createHash("sha256")
    .update(`daily-art:${date}:${purpose}`)
    .digest()
    .readUInt32LE(0);
}

type ArtworkCandidateSource = {
  label: string;
  findIds: () => Promise<string[]>;
};

async function pickArtwork(
  sources: ArtworkCandidateSource[],
  excludedIds: Set<string>,
  seed: number,
): Promise<Artwork> {
  for (const source of sources) {
    const ids = (await source.findIds()).filter((id) => !excludedIds.has(id));
    if (ids.length === 0) {
      console.debug(`No unused artworks found for ${source.label}`);
      continue;
    }

    const offset = seed % ids.length;
    for (let index = 0; index < ids.length; index++) {
      const id = ids[(offset + index) % ids.length];

      try {
        const artwork = await queryArtwork(id);
        excludedIds.add(artwork.id);
        console.debug(`Selected artwork ${artwork.id} from ${source.label}`);
        return artwork;
      } catch (error) {
        console.warn(`Skipping unusable artwork ${id} from ${source.label}`, error);
      }
    }
  }

  throw new Error(`Unable to find a valid unique artwork using: ${sources.map((source) => source.label).join(", ")}`);
}

async function readIndex(): Promise<ChallengeIndex> {
  try {
    return JSON.parse(await readFile(challengePath, "utf8")) as ChallengeIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    return { generatedAt: new Date(0).toISOString(), challenges: [] };
  }
}

async function buildChallenge(date: string, number: number): Promise<Challenge> {
  const artworkCount = await queryArtworkCount();
  const answerSeed = seedFromDate(date, "answer");
  const option1Seed = seedFromDate(date, "option-1");
  const option2Seed = seedFromDate(date, "option-2");
  const option3Seed = seedFromDate(date, "option-3");

  const artworkId = answerSeed % artworkCount;
  const artworkResultPage = Math.floor(artworkId / 100);
  const artworkIdInPage = artworkId % 100;

  console.debug(`Looking for idx ${artworkId} in page ${artworkResultPage} in place ${artworkIdInPage}`);

  const artworkList = await queryArtworkList({
    page: artworkResultPage,
  });

  // Pick the valid artwork
  const artwork = await queryArtwork(artworkList[artworkIdInPage]);

  const year = artwork.timespan.match(/\b\d{4}\b/)?.[0];
  const maskedYear = year ? year.slice(0, 2) + "??" : undefined;
  const pageCount = Math.max(1, Math.ceil(artworkCount / 100));
  const excludedIds = new Set([artwork.id]);
  const globalSource = (pageSeed: number): ArtworkCandidateSource => ({
    label: "the full collection",
    findIds: () => queryArtworkList({ page: pageSeed % pageCount }),
  });
  const periodSource: ArtworkCandidateSource[] = maskedYear === undefined ? [] : [{
    label: `the same period (${maskedYear})`,
    findIds: () => queryArtworkList({ creationDate: maskedYear }),
  }];
  const materialSource: ArtworkCandidateSource[] = artwork.material === "undefined" ? [] : [{
    label: `the same material (${artwork.material})`,
    findIds: () => queryArtworkList({ material: artwork.material }),
  }];

  // Prefer another work by the same artist, then progressively broaden the search.
  const artwork2 = await pickArtwork([
    ...(artwork.artist === "undefined" ? [] : [{
      label: `the same artist (${artwork.artist})`,
      findIds: () => queryArtworkList({ creator: artwork.artist }),
    }]),
    ...periodSource,
    ...materialSource,
    globalSource(option1Seed),
  ], excludedIds, option1Seed);

  const artwork3 = await pickArtwork([
    ...periodSource,
    ...materialSource,
    globalSource(option2Seed),
  ], excludedIds, option2Seed);

  const artwork4 = await pickArtwork([
    ...(artwork.name === "" ? [] : [{
      label: `a related description (${artwork.name})`,
      findIds: () => queryArtworkList({ technique: artwork.name }),
    }]),
    ...materialSource,
    ...periodSource,
    globalSource(option3Seed),
  ], excludedIds, option3Seed);

  return {
    date,
    number,
    title: `Daily Art #${number}`,
    answer: artwork,
    options: [artwork2, artwork3, artwork4]
  };
}

async function main(): Promise<void> {

  const index = await readIndex();
  const date = dateStamp();
  console.log(date);
  const existing = index.challenges.find((challenge) => challenge.date === date);

  if (!existing) {
    index.challenges.push(await buildChallenge(date, index.challenges.length + 1));
    index.challenges.sort((left, right) => left.date.localeCompare(right.date));
  }

  index.generatedAt = new Date().toISOString();

  await mkdir(path.dirname(challengePath), { recursive: true });
  await writeFile(challengePath, `${JSON.stringify(index, null, 2)}\n`);
}

await main();
