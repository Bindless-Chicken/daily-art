# Daily Art

A TypeScript daily game scaffold for GitHub Pages.

## Local Development

```sh
npm install
npm run dev
```

Open the app at `http://localhost:5173/`.

## Docker Development

Run the Vite development server in Docker:

```sh
docker compose up
```

Then open `http://localhost:5173/`.

The compose setup uses the official `node:24-alpine` image, mounts this project
into `/app`, and stores dependencies in a named Docker volume so local
`node_modules` does not need to match the container environment.

Run the daily challenge generator in the same container environment:

```sh
docker compose run --rm web npm run generate:challenge
```

Rebuild dependencies from scratch if needed:

```sh
docker compose down -v
docker compose up
```

## Build

```sh
npm run build
```

Set `VITE_CHALLENGES_URL` during the build to load challenges from a different
JSON URL. Without it, the app uses `public/challenges.json`. The GitHub Pages
workflow sets this to the raw `main` branch challenge file.

The frontend is a Vite app with hash-based routes:

- `#/` lists all generated days.
- `#/challenge/YYYY-MM-DD` opens a specific challenge.

## Daily Challenge Generation

```sh
npm run generate:challenge
```

The generator appends one challenge per date to `public/challenges.json`. Set
`CHALLENGE_DATE=YYYY-MM-DD` to generate a specific date.

GitHub Actions includes:

- `.github/workflows/generate-challenge.yml` to generate and commit a daily
  challenge.
- `.github/workflows/pages.yml` to build and deploy the static app to GitHub
  Pages.
