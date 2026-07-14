import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Artwork, Challenge, ChallengeIndex } from "../src/types";
import {
  queryArtwork,
  queryArtworkCount,
  queryArtworkList,
  queryArtworkListByTag,
  queryArtworkSelectionMetadata,
  queryArtworkTagLabel,
} from "./rijksmuseum-api.ts";

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

function extractYear(timespan: string): number | undefined {
  const yearText = timespan.match(/\b\d{3,4}\b/)?.[0];
  return yearText === undefined ? undefined : Number.parseInt(yearText, 10);
}

function centuryOf(year: number): number {
  return Math.floor(year / 100);
}

function formatThemeTitle(theme: string): string {
  return `${theme.charAt(0).toUpperCase()}${theme.slice(1)}`;
}

type ArtworkCandidateSource = {
  label: string;
  findIds: () => Promise<string[]>;
};

type TagCandidate = {
  id: string;
  label?: string;
};

type TaggedOptions = {
  options: Artwork[];
  theme: string;
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

async function rankTags(tags: string[], seed: number): Promise<TagCandidate[]> {
  const offset = tags.length === 0 ? 0 : seed % tags.length;
  const rotatedTags = [...tags.slice(offset), ...tags.slice(0, offset)];
  const candidates = await Promise.all(rotatedTags.map(async (id) => {
    try {
      return { id, label: await queryArtworkTagLabel(id) };
    } catch (error) {
      console.warn(`Unable to retrieve a label for tag ${id}`, error);
      return { id };
    }
  }));

  return candidates.sort((left, right) => {
    const priority = (tag: TagCandidate): number => {
      if (tag.label === undefined) return 2;
      return tag.label.trim().split(/\s+/).length < 4 ? 0 : 1;
    };
    return priority(left) - priority(right);
  });
}

async function findCenturyGroups(
  answer: Artwork,
  tag: TagCandidate,
): Promise<{ all: string[]; same: string[]; before: string[]; after: string[] }> {
  const answerYear = extractYear(answer.timespan);
  if (answerYear === undefined) {
    throw new Error(`Artwork ${answer.id} has no usable creation year`);
  }

  const answerCentury = centuryOf(answerYear);
  const ids = (await queryArtworkListByTag(tag.id)).filter((id) => id !== answer.id);
  const groups = { all: [] as string[], same: [] as string[], before: [] as string[], after: [] as string[] };

  const candidateArtworks = await Promise.all(ids.map(async (id) => {
    try {
      return { id, ...await queryArtworkSelectionMetadata(id) };
    } catch (error) {
      console.warn(`Skipping artwork ${id} while checking centuries for tag ${tag.id}`, error);
      return { id, isPainting: false, year: undefined };
    }
  }));

  for (const { id, isPainting, year } of candidateArtworks) {
    if (!isPainting || year === undefined) continue;

    groups.all.push(id);
    const century = centuryOf(year);
    if (century === answerCentury) groups.same.push(id);
    if (century < answerCentury) groups.before.push(id);
    if (century > answerCentury) groups.after.push(id);
  }

  return groups;
}

async function pickTaggedOptions(answer: Artwork, date: string): Promise<TaggedOptions> {
  if (answer.tags.length === 0) {
    throw new Error(`Artwork ${answer.id} has no tags for finding similar works`);
  }

  const tags = await rankTags(answer.tags, seedFromDate(date, "tag"));
  for (const tag of tags) {
    const label = tag.label ?? tag.id;
    const groups = await findCenturyGroups(answer, tag);
    if (groups.all.length < 3) {
      console.debug(`Tag ${label} has fewer than three other dated paintings`);
      continue;
    }

    console.debug(`Selected tag ${label} for artwork ${answer.id}`);
    const excludedIds = new Set([answer.id]);
    const slots = [
      { name: "same-century", description: "in the same century", ids: groups.same },
      { name: "before-century", description: "before the answer's century", ids: groups.before },
      { name: "after-century", description: "after the answer's century", ids: groups.after },
    ];
    const selected: Array<Artwork | undefined> = [undefined, undefined, undefined];

    // Reserve every available preferred bucket before filling missing buckets
    // from the complete set, so a fallback cannot consume a preferred choice.
    for (const [index, slot] of slots.entries()) {
      if (slot.ids.length === 0) continue;

      try {
        selected[index] = await pickArtwork([{
          label: `tag ${label} ${slot.description}`,
          findIds: async () => slot.ids,
        }], excludedIds, seedFromDate(date, slot.name));
      } catch (error) {
        console.warn(`Unable to load a preferred ${slot.name} artwork for tag ${label}`, error);
      }
    }

    for (const [index, slot] of slots.entries()) {
      if (selected[index] !== undefined) continue;

      try {
        selected[index] = await pickArtwork([{
          label: `tag ${label} from any century`,
          findIds: async () => groups.all,
        }], excludedIds, seedFromDate(date, `${slot.name}-fallback`));
      } catch (error) {
        console.warn(`Unable to fill the ${slot.name} slot from any century for tag ${label}`, error);
      }
    }

    const [sameCentury, before, after] = selected;
    if (sameCentury !== undefined && before !== undefined && after !== undefined) {
      return {
        options: [sameCentury, before, after],
        theme: tag.label ?? `Rijksmuseum theme ${tag.id.match(/\d+$/)?.[0] ?? tag.id}`,
      };
    }
  }

  throw new Error(`None of artwork ${answer.id}'s tags provide three usable dated paintings`);
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

export async function buildChallenge(date: string, number: number): Promise<Challenge> {
  const artworkCount = await queryArtworkCount();
  if (artworkCount === 0) {
    throw new Error("The Rijksmuseum collection search returned no artworks");
  }

  const answerSeed = seedFromDate(date, "answer");
  const artworkId = answerSeed % artworkCount;
  const artworkResultPage = Math.floor(artworkId / 100);
  const artworkIdInPage = artworkId % 100;

  console.debug(`Looking for idx ${artworkId} in page ${artworkResultPage} in place ${artworkIdInPage}`);
  const artworkList = await queryArtworkList({ page: artworkResultPage });
  if (artworkList.length === 0) {
    throw new Error(`Unable to find artworks on collection page ${artworkResultPage}`);
  }

  const answerOffset = artworkIdInPage % artworkList.length;
  const answerIds = [...artworkList.slice(answerOffset), ...artworkList.slice(0, answerOffset)];
  for (const answerId of answerIds) {
    try {
      const answer = await queryArtwork(answerId);
      const { options, theme } = await pickTaggedOptions(answer, date);

      return {
        date,
        number,
        title: `Daily Art #${number} — ${formatThemeTitle(theme)}`,
        answer,
        options,
      };
    } catch (error) {
      console.warn(`Artwork ${answerId} cannot provide this challenge's tagged century choices`, error);
    }
  }

  throw new Error(`No artwork on collection page ${artworkResultPage} could provide three tagged century choices`);
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

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
