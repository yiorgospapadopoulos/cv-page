# Yiorgos Papadopoulos CV page

A single static page that accompanies my CV. It introduces me in a few seconds (giant name, one-line pitch, an interactive 3D lanyard badge), then shows the evidence in terminal-styled windows: who I am, projects, experience, stack and education. At the end there is a small working terminal where a visitor can type commands such as `help`, `ls` or `cat thesis`, and a footer with my links and a CV download.

It is built with Astro (a static site generator, think of it as a build step that turns templates and one data file into plain HTML) and TypeScript. The only heavy JavaScript is the 3D badge, which is loaded lazily and is optional: every visitor gets a complete page without it.

## Requirements

- Node.js 26
- npm 11

## Run it

```sh
npm install
npx playwright install chromium firefox webkit
npm run dev
```

`npm run dev` serves the site with hot reload at http://localhost:4321. To see exactly what visitors get, build and preview the production output:

```sh
npm run build
npm run preview
```

## Edit the content

All page text and data live in one file, `src/content/profile.ts`. Components never contain copy of their own. The file is organised by section:

| Key              | What it controls                                                       |
| ---------------- | ---------------------------------------------------------------------- |
| `meta`           | Page title and description (also used for the social preview)          |
| `links`          | LinkedIn, GitHub and email                                             |
| `hero`           | The one-liner, the `[more]` label and the two lines at the top right   |
| `about`          | The paragraphs and languages in the `[more]` dialog and the whoami     |
| `badge`          | Text on the badge (name, role, chips, corner detail, strap)            |
| `projects`       | Each project: title, summary, metrics, highlights, stack, ASCII sketch |
| `experience`     | Work history, shown as a git log                                       |
| `stackGroups`    | The stack window                                                       |
| `education`      | The education window                                                   |
| `certifications` | Certifications                                                         |
| `footer`         | Closing line, pill links and the CV button                             |
| `commands`       | The command list shown by `help` in the interactive terminal           |

The data is typed (`src/content/types.ts`) and checked by `src/content/validate.ts`: no empty strings, https links, a valid email, kebab-case unique project slugs, no repository link on a private case study, and ASCII-only sketches of limited width. `npm test` runs these checks, so a typo fails loudly. Some tests also pin the current wording on purpose (for example the page title and the five project slugs), so when you change copy deliberately, update the matching expectation in `src/content/profile.test.ts`.

A few strings live outside `profile.ts` because they are site chrome rather than content: the owner name, links and skip link label in `src/lib/site.ts`, and the terminal prompt, window titles, section commands and welcome lines in `src/lib/terminal.ts`. Page text is limited to the Latin character set, because only the Latin font subsets are shipped. A test fails if a character outside it is added.

## Replace the CV PDF

1. Copy the new file over `public/Yiorgos_Papadopoulos_CV.pdf` (keep the same name, or change `footer.cvPath` in `profile.ts` and the matching expectation in `profile.test.ts`).
2. Compute its hash and paste it into `verifiedSha256` in `src/content/cv.test.ts`:

   ```sh
   shasum -a 256 public/Yiorgos_Papadopoulos_CV.pdf
   ```

3. Run `npm test`. The test exists so that the published PDF can only change on purpose.

The CV must not contain a phone number.

## Regenerate the social preview image

The Open Graph image `public/og.png` (1200 by 630) is drawn from a small HTML template inside `scripts/og.mjs` using the same fonts as the site. Edit the text there if my name or role changes, then run:

```sh
npm run og
```

## Quality gates

| Command                 | What it does                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Everything below in order: format check, lint, type check, dependency audit, unit tests, build          |
| `npm run test:e2e`      | Builds the site and runs the browser tests on desktop Chromium, a Pixel 7 emulation, Firefox and WebKit |
| `npm run test:coverage` | Unit tests with a 100% coverage requirement on `src/**/*.ts`                                            |
| `npm run format`        | Rewrites files with Prettier                                                                            |
| `npm run perf`          | Measures a production build (see below)                                                                 |
| `npm run og`            | Regenerates the social preview image                                                                    |

Both `npm run check` and `npm run test:e2e` must pass before a change is committed. Unit tests (Vitest) sit next to their sources as `*.test.ts`. Browser tests (Playwright) are in `tests/`: layout, terminals, the prompt, the footer, the badge, accessibility scans with axe-core, keyboard and skip link checks, and performance assertions.

The `.astro` and `.tsx` presentation components and the 3D render loop are excluded from the coverage requirement because they are verified in a real browser instead.

### Accessibility

The page uses `header`, `main` and `footer` landmarks, a skip link as the first focusable element, one `h1`, and visible focus styles. Terminal text is in the accessibility tree from the start: the typing animation only changes opacity, and the animated command line is hidden from assistive technology in favour of a visually hidden copy, so a screen reader never hears half-typed commands. Focusing a link inside a terminal that has not typed yet reveals it immediately. The interactive prompt keeps its caret as the focus indicator. Reduced motion shows everything at once, and the page works without JavaScript.

### Performance

`npm run perf` serves `dist/` with gzip, then measures desktop and a throttled mobile profile (Fast 3G, 4x CPU) with and without the save-data hint, reporting Largest Contentful Paint, bytes transferred before the 3D scene starts, and total bytes. The hero name is the LCP element and paints without waiting for any badge code: CSS is inlined, only the Latin font subsets ship, and the heading font is preloaded.

## How the 3D badge works

The server-rendered page always contains a plain HTML and CSS badge (the placeholder card). A small React island, `src/components/badge/Badge.tsx`, decides in the browser which version to show. The pure decision logic lives in `src/lib/badge/` and is fully unit tested (`loadPolicy.ts`, `capability.ts`, `scrollTilt.ts`).

- Below 860px wide, on any device (phone, tablet or a narrow desktop window), the page shows the static card without a strap, tilted 7 degrees. The tilt rotates with the scroll position (from 7 degrees at the top towards -12 degrees further down) and stops updating once the hero is well out of view. The 3D code is never downloaded.
- At 860px and wider, the interactive 3D badge is loaded. `Scene.tsx` is fetched on demand once the browser is idle. It draws the card faces to canvas textures, simulates the lanyard as a chain of Rapier physics joints through React Three Fiber, and fades in over the placeholder when ready. It stops rendering while it is off screen or the tab is hidden.
- Switching is live: resizing the window across 860px, or changing the reduced-motion setting, swaps between the two modes without a reload.
- Fallbacks keep the static card: reduced motion (no animation at all), no WebGL, a save-data or 2g connection, a load error or a lost graphics context. At 860px and wider the static card hangs from its strap and sways gently, except under reduced motion.

The Rapier engine is WebAssembly; a small build plugin in `astro.config.mjs` serves it as its own `.wasm` file instead of the base64 copy inside the library, which makes the download smaller.

## Deployment

The site is hosted on Cloudflare Pages at https://yiorgospapadopoulos.dev (domain registered with Cloudflare Registrar). The build output is plain static files in `dist/`; Cloudflare compresses text and `.wasm` files and serves `.wasm` as `application/wasm`. The site URL lives in `src/lib/site.ts` (`siteUrl`) and feeds `site` in `astro.config.mjs`, so the canonical link and social preview image are absolute.

One-time setup on a new machine:

1. `npx wrangler login` opens the browser to authorize your Cloudflare account.
2. `npm run deploy:setup` creates the Pages project `yiorgospapadopoulos` (only needed once per account).

Publishing a change: `npm run deploy`. It runs every quality gate (`npm run check`, which also builds) and then uploads `dist/` to the production branch. `public/_headers` sets security headers and long caching for the hashed files in `/_astro/`.
