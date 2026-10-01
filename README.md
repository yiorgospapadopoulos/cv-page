# Yiorgos Papadopoulos CV page

A single static page that accompanies my CV. It is built with Astro and TypeScript, and a React island is planned for an interactive 3D badge. This repository currently holds the project scaffold and its quality gates; the page content is added in later steps.

## Requirements

- Node.js 26
- npm 11

## Setup

```sh
npm install
npx playwright install chromium
```

## Commands

| Command                 | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start the development server                                                                |
| `npm run build`         | Build the static site into `dist/`                                                          |
| `npm run preview`       | Serve the production build locally                                                          |
| `npm run format`        | Format all files with Prettier                                                              |
| `npm run format:check`  | Check formatting without changing files                                                     |
| `npm run lint`          | Lint with ESLint, failing on any warning                                                    |
| `npm run typecheck`     | Type check with `astro check`                                                               |
| `npm run test`          | Run unit tests with Vitest                                                                  |
| `npm run test:coverage` | Run unit tests and enforce 100% coverage                                                    |
| `npm run test:e2e`      | Build the site and run Playwright tests on a desktop and a mobile viewport                  |
| `npm run audit`         | Fail on high severity dependency vulnerabilities                                            |
| `npm run check`         | Run format check, lint, type check, audit, unit tests with coverage, and the build in order |

Unit tests live next to their sources as `*.test.ts`. Browser tests live in `tests/`.
