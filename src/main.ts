import { findChallenge, loadChallenges } from "./challenges";
import {
  clearChallengeProgress,
  loadChallengeProgress,
  saveChallengeProgress,
  type ChallengeProgress,
  type ValidationResult,
} from "./progress";
import "./styles.css";
import type { Artwork, Challenge } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

const appRoot = app;
const TOTAL_CLUES = 4;

function route(): { page: "list" | "challenge"; date?: string } {
  const [, page, date] = window.location.hash.match(/^#\/([^/]+)\/?([^/]*)?/) ?? [];
  if (page === "challenge") {
    return { page: "challenge", date };
  }

  return { page: "list" };
}

function navigateToChallenge(date: string): void {
  window.location.hash = `/challenge/${date}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function renderShell(content: string): void {
  appRoot.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/">Daily Art</a>
      <nav>
        <a href="#/">Archive</a>
      </nav>
    </header>
    <main>${content}</main>
    <aside class="debug-reset-zone" aria-label="Debug controls">
      <button id="reset-progress" class="reset-progress" type="button">Reset progress</button>
    </aside>
  `;

  document.querySelector<HTMLButtonElement>("#reset-progress")?.addEventListener("click", () => {
    clearChallengeProgress();
    void render();
  });
}

function renderLoading(): void {
  renderShell(`<section class="status">Loading challenges...</section>`);
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  renderShell(`<section class="status error">${escapeHtml(message)}</section>`);
}

function renderList(challenges: Challenge[]): void {
  const items = challenges
    .map((challenge) => {
      const progress = loadChallengeProgress(challenge.date);
      const cluesUsed = Math.min(
        Math.max(progress?.cluesRevealed ?? 0, 0),
        TOTAL_CLUES,
      );
      let usedClueStatus = "in-progress";
      let progressLabel = "Not started, no clues used";

      if (progress) {
        const clueLabel = `${cluesUsed} ${cluesUsed === 1 ? "clue" : "clues"} used`;
        if (progress.validationResult) {
          progressLabel = `${clueLabel} · ${progress.validationResult === "correct" ? "Found" : "Not found"}`;
          usedClueStatus = progress.validationResult;
        } else {
          progressLabel = `${clueLabel} · In progress`;
        }
      }

      const clueMarkers = Array.from({ length: TOTAL_CLUES }, (_, index) => {
        const markerStatus = index < cluesUsed ? usedClueStatus : "unused";
        return `<span class="clue-marker" data-status="${markerStatus}" aria-hidden="true"></span>`;
      }).join("");

      return `
        <li>
          <button class="day-row" data-date="${escapeHtml(challenge.date)}">
            <span>
              <strong>${escapeHtml(challenge.title)}</strong>
              <small>${escapeHtml(challenge.date)} - #${challenge.number}</small>
            </span>
            <span class="clue-progress" role="img" aria-label="${escapeHtml(progressLabel)}" title="${escapeHtml(progressLabel)}">
              ${clueMarkers}
            </span>
          </button>
        </li>
      `;
    })
    .join("");

  renderShell(`
    <section class="archive">
      <div class="section-heading">
        <h1>Daily challenges</h1>
        <p>Pick a day and solve the artwork-and-clue puzzle.</p>
      </div>
      <ul class="day-list">${items}</ul>
    </section>
  `);

  document.querySelectorAll<HTMLButtonElement>(".day-row").forEach((button) => {
    button.addEventListener("click", () => {
      const date = button.dataset.date;
      if (date) {
        navigateToChallenge(date);
      }
    });
  });
}

function renderSelectedArtwork(artwork: Artwork): string {
  return `
    <section class="selected-artwork" aria-live="polite">
      <img id="selected-artwork-image" src="${escapeHtml(artwork.imageUrl)}" alt="${escapeHtml(artwork.name)}" draggable="false" />
    </section>
  `;
}

function renderArtworkOption(artwork: Artwork, selected: boolean): string {
  return `
    <button class="artwork-option" type="button" data-artwork-id="${escapeHtml(artwork.id)}" data-selected="${String(selected)}" aria-label="Show artwork">
      <img src="${escapeHtml(artwork.imageUrl)}" alt="${escapeHtml(artwork.name)}" draggable="false" />
    </button>
  `;
}

function displayValue(value: string): string {
  const trimmedValue = value.trim();
  return trimmedValue && trimmedValue.toLowerCase() !== "undefined"
    ? trimmedValue
    : "Unknown";
}

function hashSeed(seed: number): number {
  const value = String(seed);
  let hash = 1779033703 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function shuffleArtworks(artworks: Artwork[], seed: number): Artwork[] {
  const shuffledArtworks = [...artworks];
  const random = seededRandom(seed);

  for (let index = shuffledArtworks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledArtworks[index], shuffledArtworks[swapIndex]] = [
      shuffledArtworks[swapIndex],
      shuffledArtworks[index],
    ];
  }

  return shuffledArtworks;
}

function renderClueTile(label: string, value: string, index: number): string {
  return `
    <article class="clue-tile" data-clue-index="${index}">
      <p class="clue-tile-label">${escapeHtml(label)}</p>
      <p class="clue-tile-value">${escapeHtml(displayValue(value))}</p>
    </article>
  `;
}

function renderAnswerDetails(artwork: Artwork): string {
  return `
    <section id="answer-details" class="answer-details" aria-label="Answer details" hidden>
      <div class="fact-sheet">
        <dl>
          <div>
            <dt>Title</dt>
            <dd id="detail-title">${escapeHtml(displayValue(artwork.name))}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd id="detail-date">${escapeHtml(displayValue(artwork.timespan))}</dd>
          </div>
          <div>
            <dt>Artist</dt>
            <dd id="detail-artist">${escapeHtml(displayValue(artwork.artist))}</dd>
          </div>
          <div>
            <dt>Material</dt>
            <dd id="detail-material">${escapeHtml(displayValue(artwork.material))}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd id="detail-dimensions">${escapeHtml(displayValue(artwork.dimensions))}</dd>
          </div>
        </dl>
      </div>
      <div class="exhibit-script">
        <p id="detail-exhibit-script">${escapeHtml(displayValue(artwork.exhibitScript))}</p>
      </div>
    </section>
  `;
}

function renderChallenge(challenge: Challenge | undefined): void {
  if (!challenge) {
    renderShell(`
      <section class="status error">
        Challenge not found. <a href="#/">Return to the archive.</a>
      </section>
    `);
    return;
  }

  const challengeDate = challenge.date;
  const answerArtworkId = challenge.answer.id;

  const artworks = shuffleArtworks(
    [challenge.answer, ...challenge.options],
    challenge.number,
  );
  const savedProgress = loadChallengeProgress(challenge.date);
  const savedSelectedArtwork = artworks.find(
    (artwork) => artwork.id === savedProgress?.selectedArtworkId,
  );
  const savedValidatedArtwork = artworks.find(
    (artwork) => artwork.id === savedProgress?.validatedArtworkId,
  );
  const initialArtwork = savedValidatedArtwork ?? savedSelectedArtwork ?? artworks[0];
  const artworkOptions = artworks
    .map((artwork) => renderArtworkOption(artwork, artwork.id === initialArtwork.id))
    .join("");
  const clues = [
    { label: "Timespan", value: challenge.answer.timespan },
    { label: "Material", value: challenge.answer.material },
    { label: "Artist", value: challenge.answer.artist },
    { label: "Title", value: challenge.answer.name },
  ];
  const clueTiles = clues
    .map((clue, index) => renderClueTile(clue.label, clue.value, index))
    .join("");

  renderShell(`
    <section class="challenge">
      <div class="section-heading">
        <p class="eyebrow">${escapeHtml(challenge.date)} - #${challenge.number}</p>
        <h1>${escapeHtml(challenge.title)}</h1>
      </div>
      <div class="challenge-board">
        ${renderSelectedArtwork(initialArtwork)}
        <section class="artwork-options" aria-label="Artwork choices" role="list">
          ${artworkOptions}
        </section>
        <div class="choice-controls">
          <button id="reveal-clue" class="reveal-clue" type="button">Reveal next clue</button>
          <button id="validate-choice" class="validate-choice" type="button">Validate choice</button>
        </div>
        <section class="clue-panel">
          <div class="clue-grid" aria-label="Clues">
            ${clueTiles}
          </div>
          ${renderAnswerDetails(challenge.answer)}
        </section>
      </div>
    </section>
  `);

  const selectedArtwork = document.querySelector<HTMLElement>(".selected-artwork");
  const selectedImage = document.querySelector<HTMLImageElement>("#selected-artwork-image");
  const choiceControls = document.querySelector<HTMLElement>(".choice-controls");
  const revealClue = document.querySelector<HTMLButtonElement>("#reveal-clue");
  const validateChoice = document.querySelector<HTMLButtonElement>("#validate-choice");
  const clueGrid = document.querySelector<HTMLElement>(".clue-grid");
  const answerDetails = document.querySelector<HTMLElement>("#answer-details");
  const detailTitle = document.querySelector<HTMLElement>("#detail-title");
  const detailDate = document.querySelector<HTMLElement>("#detail-date");
  const detailArtist = document.querySelector<HTMLElement>("#detail-artist");
  const detailMaterial = document.querySelector<HTMLElement>("#detail-material");
  const detailDimensions = document.querySelector<HTMLElement>("#detail-dimensions");
  const detailExhibitScript = document.querySelector<HTMLElement>("#detail-exhibit-script");
  const clueTilesElements = Array.from(document.querySelectorAll<HTMLElement>(".clue-tile"));
  let visibleClues = Math.min(Math.max(savedProgress?.cluesRevealed ?? 1, 1), clues.length);
  let selectedArtworkId = initialArtwork.id;
  let validationResult: ValidationResult | undefined =
    savedValidatedArtwork && savedProgress?.validationResult
      ? savedProgress.validationResult
      : undefined;
  let hasValidatedChoice = validationResult !== undefined;

  function persistProgress(): void {
    const progress: ChallengeProgress = {
      cluesRevealed: visibleClues,
      selectedArtworkId,
    };

    if (hasValidatedChoice && validationResult) {
      progress.validatedArtworkId = selectedArtworkId;
      progress.validationResult = validationResult;
    }

    saveChallengeProgress(challengeDate, progress);
  }

  function updateClues(): void {
    clueTilesElements.forEach((tile, index) => {
      tile.dataset.available = String(index < visibleClues);
    });

    if (revealClue) {
      revealClue.disabled = visibleClues >= clues.length;
      revealClue.textContent =
        visibleClues >= clues.length ? "All clues revealed" : "Reveal next clue";
    }
  }

  revealClue?.addEventListener("click", () => {
    visibleClues = Math.min(visibleClues + 1, clues.length);
    updateClues();
    persistProgress();
  });

  updateClues();

  function updateAnswerDetails(artwork: Artwork): void {
    if (detailTitle) {
      detailTitle.textContent = displayValue(artwork.name);
    }

    if (detailDate) {
      detailDate.textContent = displayValue(artwork.timespan);
    }

    if (detailArtist) {
      detailArtist.textContent = displayValue(artwork.artist);
    }

    if (detailMaterial) {
      detailMaterial.textContent = displayValue(artwork.material);
    }

    if (detailDimensions) {
      detailDimensions.textContent = displayValue(artwork.dimensions);
    }

    if (detailExhibitScript) {
      detailExhibitScript.textContent = displayValue(artwork.exhibitScript);
    }
  }

  function updateZoomOrigin(event: PointerEvent): void {
    if (!selectedArtwork) {
      return;
    }

    const bounds = selectedArtwork.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    selectedArtwork.style.setProperty("--zoom-x", `${Math.max(0, Math.min(100, x))}%`);
    selectedArtwork.style.setProperty("--zoom-y", `${Math.max(0, Math.min(100, y))}%`);
  }

  selectedArtwork?.addEventListener("pointerdown", (event) => {
    updateZoomOrigin(event);
    selectedArtwork.dataset.zoomed = "true";
    selectedArtwork.setPointerCapture(event.pointerId);
  });

  selectedArtwork?.addEventListener("pointermove", (event) => {
    if (selectedArtwork.dataset.zoomed === "true") {
      updateZoomOrigin(event);
    }
  });

  function clearZoom(event: PointerEvent): void {
    if (!selectedArtwork) {
      return;
    }

    delete selectedArtwork.dataset.zoomed;
    if (selectedArtwork.hasPointerCapture(event.pointerId)) {
      selectedArtwork.releasePointerCapture(event.pointerId);
    }
  }

  selectedArtwork?.addEventListener("pointerup", clearZoom);
  selectedArtwork?.addEventListener("pointercancel", clearZoom);
  selectedArtwork?.addEventListener("pointerleave", clearZoom);
  selectedArtwork?.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  document.querySelectorAll<HTMLButtonElement>(".artwork-option").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>(".artwork-option").forEach((option) => {
        option.dataset.selected = String(option === button);
      });

      const selectedArtwork = artworks.find((artwork) => artwork.id === button.dataset.artworkId);
      if (selectedArtwork && selectedImage) {
        selectedArtworkId = selectedArtwork.id;
        selectedImage.src = selectedArtwork.imageUrl;
        selectedImage.alt = selectedArtwork.name;
        if (hasValidatedChoice) {
          updateAnswerDetails(selectedArtwork);
        }
        persistProgress();
      }

    });
  });

  function showValidation(): void {
    if (!validationResult) {
      return;
    }

    hasValidatedChoice = true;
    document.querySelectorAll<HTMLButtonElement>(".artwork-option").forEach((option) => {
      option.dataset.status =
        option.dataset.artworkId === answerArtworkId ? "correct" : "incorrect";
    });

    if (choiceControls) {
      choiceControls.dataset.validated = "true";
    }

    const validatedArtwork = artworks.find((artwork) => artwork.id === selectedArtworkId);
    if (validatedArtwork) {
      updateAnswerDetails(validatedArtwork);
    }

    if (clueGrid) {
      clueGrid.hidden = true;
    }

    if (answerDetails) {
      answerDetails.hidden = false;
    }

    if (revealClue) {
      revealClue.setAttribute("aria-hidden", "true");
      revealClue.disabled = true;
    }

    if (validateChoice) {
      validateChoice.textContent = validationResult === "correct" ? "Correct" : "Incorrect";
      validateChoice.dataset.state = validationResult === "correct" ? "success" : "error";
      validateChoice.disabled = true;
    }
  }

  validateChoice?.addEventListener("click", () => {
    validationResult = selectedArtworkId === answerArtworkId ? "correct" : "incorrect";
    showValidation();
    persistProgress();
  });

  if (hasValidatedChoice) {
    showValidation();
  }

  persistProgress();
}

async function render(): Promise<void> {
  renderLoading();
  try {
    const challenges = await loadChallenges();
    const currentRoute = route();
    if (currentRoute.page === "challenge") {
      renderChallenge(findChallenge(challenges, currentRoute.date));
      return;
    }

    renderList(challenges);
  } catch (error) {
    renderError(error);
  }
}

window.addEventListener("hashchange", () => {
  void render();
});

void render();
