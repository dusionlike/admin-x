<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is a Vite+ monorepo for a Vue + Element Plus administration console and a NestJS API. Vite+ wraps runtime management, package management, frontend tooling, testing, formatting, linting, and task execution in the global `vp` CLI. Vite+ is distinct from Vite: use `vp dev` and `vp build` for Vite app commands, and use `vp run <script>` for package scripts.

## Built-in Commands vs Scripts

- `vp <name>` runs a Vite+ built-in command.
- `vp run <name>` runs a `package.json` script or a `vite.config.ts` task.
- `vp run -r <name>` runs the task across workspace packages.
- `vp run -r --parallel dev` starts the admin and API development servers together.

The root scripts are:

```text
vp run dev       # Vue + NestJS development servers
vp run build     # standalone .output deployment package
vp run start     # run .output/server/main.mjs
vp run build:workspace # build each workspace package independently
vp check         # root formatting and lint check
vp run -r check  # framework-aware TypeScript checks
vp run -r test   # shared and API tests
vp run -r build  # shared package, admin and API builds
vp run ready     # check, typecheck, test, workspace build and deployment build
```

## Project Layout

```text
apps/admin/       Vue 3 + Vue Router + Pinia + Element Plus frontend
apps/api/         NestJS modules, JWT guard and node:sqlite-backed services
packages/shared/  API contracts, pagination helpers and response utilities
tools/deploy/     TypeScript standalone deployment assembly workspace
third_party/      Read-only visual/reference projects
```

The frontend uses `@` for `apps/admin/src`. The API is an ESM NestJS app; keep `.js` extensions on relative imports so NodeNext type checking and the Vite SSR bundle resolve consistently. `apps/api/vite.config.ts` keeps the normal API build externalized and uses `--mode standalone` to bundle runtime dependencies into `apps/api/dist/standalone/main.mjs`.

Keep deployment assembly in the `tools/deploy` workspace package (`src/main.ts`). Root build scripts should delegate to `vp -C tools/deploy run --no-cache deploy` so the standalone output is never stale; do not add another root-level `.mjs` build helper.

Keep explicit `@Inject(...)` on Nest constructor dependencies. Vite+ `tsx` development execution does not reliably emit `design:paramtypes`, while the explicit tokens keep dev and production DI behavior consistent.

## Runtime and API Notes

- Development ports: admin `5173`, API `3000`.
- Frontend `/api` requests are proxied to `http://localhost:3000` by Vite.
- `vp run build` creates `.output/`, with the bundled NestJS server at `.output/server/main.mjs` and Vue assets at `.output/server/public`; the output package has no runtime `node_modules` requirement.
- The production NestJS process serves `/api` and the Vue SPA from the same origin, and falls back to `index.html` for browser routes. Keep this fallback after static assets and before the server starts.
- Use `FRONTEND_DIST` only when the static files are stored outside `.output/server/public`; the deployment builder relies on the default colocated path.
- There are no demo accounts. The first empty database must be initialized through `GET /api/auth/setup-status` and `POST /api/auth/setup`; setup creates the only initial super-admin and logs the user in.
- API endpoints other than `/api/auth/setup-status`, `/api/auth/setup`, and `/api/auth/login` require a Bearer token.
- User, password-hash, login-visit, and activity data are persisted with Node's built-in `node:sqlite` (`DatabaseSync`). The default path is `apps/api/data/admin-x.sqlite` in development and `.output/data/admin-x.sqlite` in the deployment bundle; `DATABASE_PATH` overrides it.
- Passwords must never be stored or returned in plaintext. Use the existing scrypt helper and keep database access in the API layer.
- Use `packages/shared` for browser/server-neutral interfaces and pure helpers. Do not add Element Plus, NestJS, Axios, or other runtime-specific dependencies there.

## UI Direction

The admin UI follows the information hierarchy of `third_party/vue-vben-admin`: dark navigation rail, compact top bar, workbench metrics, quick actions, activity feed, and dense management tables. Keep the implementation in the local Vue/Element Plus components; do not import the reference app as a dependency or copy its private framework internals.

## Admin Interaction Conventions

- Use `apps/admin/src/stores/theme.ts` as the single source of truth for theme mode. Apply the `dark` class to `<html>` and keep the choice in `localStorage`; do not add page-local theme state.
- Keep `ThemeToggleButton.vue` on both authenticated and login surfaces. Its click handler owns the reduced-motion fallback and the Vben-style `startViewTransition` circular reveal; do not replace it with a direct class toggle in individual pages.
- Keep custom page colors on the `--ax-*` tokens from `apps/admin/src/styles/index.css` so dark mode works across cards, tables, settings and profile views.
- The sidebar uses one `collapsed` state and CSS-controlled label fading. Keep the aside width, menu width and label visibility driven by that same state; do not reintroduce a delayed `menuCollapsed` state or a second Element Plus collapse transition.
- Notification badges must be driven by an unread count. Do not render `is-dot` unconditionally when the demo notification list is empty.
- The user dropdown's “个人资料” command routes to the authenticated `profile` route. Keep that menu item enabled and add new account actions as explicit router commands.
- Frontend API calls go through `apps/admin/src/api/http.ts`; preserve the `/api` fallback when `VITE_API_BASE_URL` is missing or blank so the dev proxy remains usable.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` for formatting and linting.
- [ ] Run `vp run -r check` for Vue, NestJS, and shared TypeScript checks.
- [ ] Run `vp run -r test` and `vp run -r build` for behavior and build validation.
- [ ] Run `vp run build` and smoke-test `.output/server/main.mjs` as the single deployment process.
- [ ] Check `vite.config.ts`, the package scripts, and the relevant app config before changing task behavior.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.
- [ ] For admin UI changes, manually verify first-time setup/login, sidebar collapse, notification badge state, theme persistence, and the profile dropdown route in a browser.

<!--VITE PLUS END-->
