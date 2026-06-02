// Static-export mode flag.
//
// The app ships in two shapes from one codebase:
//   • Local / Docker — the full server: live scheduler, on-demand Claude
//     analysis, Yahoo quotes, manual fetch/digest. This is `main` unchanged.
//   • GitHub Pages — a static snapshot (`output: 'export'`). No backend, so
//     anything that hits an API route is off: on-demand individual analysis
//     (the thing we explicitly gate so visitors can't spend our API budget),
//     manual fetch/brief, live quotes. The daily digest + already-run analyses
//     are baked into the HTML at build time and shared by both shapes.
//
// `NEXT_PUBLIC_STATIC_EXPORT` is set only by scripts/build-static.mjs. Because
// it's a `NEXT_PUBLIC_` var, Next inlines it into the client bundle at build,
// so `IS_STATIC` is a compile-time constant — gated fetches dead-code away.
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1';
