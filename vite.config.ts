import { defineConfig } from "vite";

function githubPagesBase(): string {
  const explicitBase = process.env.VITE_BASE_PATH;
  if (explicitBase) {
    return explicitBase;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_ACTIONS || !repository) {
    return "/";
  }

  const repositoryName = repository.split("/").at(-1);
  if (!repositoryName || repositoryName.endsWith(".github.io")) {
    return "/";
  }

  return `/${repositoryName}/`;
}

export default defineConfig({
  base: githubPagesBase(),
});
