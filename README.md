This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Two build shapes

The app ships in two shapes from one codebase, switched by the
`NEXT_PUBLIC_STATIC_EXPORT` env var (set only by the static build script):

| | **Local / Docker** (`npm run dev`, `npm run build`) | **GitHub Pages** (`npm run build:static`) |
|---|---|---|
| Output | Node server (`output: standalone`) | Static HTML (`output: export` → `out/`) |
| Daily digest | Live + baked | **Baked** at build time (shared) |
| On-demand individual analysis | ✅ | ❌ disabled (no backend to spend the API budget) |
| Manual Fetch / Brief | ✅ | ❌ |
| Live quotes / trending | Live (Yahoo) | Trending **baked** per window; quotes off |
| Scheduler / API routes | ✅ | excluded from the build |

Local is unchanged `main` — every gated feature is behind a build-time flag, so
the server build behaves identically to before.

## Publishing to GitHub Pages

The static build reads the local SQLite DB (`data/serenity.db`, gitignored) to
bake the posts + latest daily digest into the HTML, so **it must run on a
machine that has the populated DB** (your local box / the Docker host). CI can't
bake data it doesn't have.

```bash
# Build the snapshot into out/ (defaults to base path /market-brief):
npm run build:static

# Build + force-push out/ to the gh-pages branch:
npm run deploy:pages
```

Then enable **Settings → Pages → Deploy from branch → `gh-pages`** once. The site
serves at `https://<user>.github.io/<repo>/`.

⚠ **`basePath` must equal the repo name.** The default targets a repo named
`market-brief` (→ `realzza.github.io/market-brief`). The current remote is
`serenity-tracker`, so either rename the GitHub repo to `market-brief`, or set
`PAGES_BASE_PATH=/serenity-tracker` (and re-run). Env knobs:

- `PAGES_BASE_PATH` — URL sub-path / repo name (default `/market-brief`; `""` for a root/custom-domain site)
- `PAGES_REMOTE` — remote name or URL to push to (default `origin`)
- `PAGES_BRANCH` — branch Pages serves from (default `gh-pages`)

To preview the export locally under its base path:

```bash
mkdir -p .pages-preview && ln -sf ../out .pages-preview/market-brief
npx serve -l 4000 .pages-preview   # → http://localhost:4000/market-brief/
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
