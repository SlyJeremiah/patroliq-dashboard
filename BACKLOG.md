# Dashboard backlog

Collected from feature development. Already fixed in the foundation: AreaMap container height, marker drift after refresh, .overline vs Tailwind utility clash, WebGL in screenshot tooling.

## admin

These are workarounds I put inside `src/features/admin`. Each item describes the change that would make the workaround unnecessary.

## Layout and CSS
1. **The AreaMap container collapses to 0 px height.** `maplibre-gl.css` is not in a layer, and its `.maplibregl-map { position: relative }` rule beats Tailwind's `absolute inset-0` on the map container inside `AreaMap`. Unless a parent forces the size, the canvas is 0 px tall.
   - Workaround: `setup/StepLayout.tsx` wraps the map in `[&_.maplibregl-map]:!absolute`.
   - Fix: give the container an inline `style={{ position: 'absolute', inset: 0 }}`, or import the MapLibre CSS inside `@layer base`.
2. **`.overline` clashes with Tailwind.** Tailwind v4 already has an `overline` utility (`text-decoration-line: overline`), so every `.overline` label also draws a line above its text.
   - Workaround: the admin feature uses explicit utilities instead.
   - Fix: rename the component class, for example to `.label-caps`.
3. **Maps are blank in `scripts/shot.py` screenshots.** Headless Edge never draws the WebGL canvas, and the `load` event does not fire in time, so HTML markers are missing too. This also happens with SwiftShader flags, and it affects `home.png` as well.
   - I checked map-dependent flows through the DOM and the API instead.

## Types (`src/api/types.ts`) and the real API
4. `AuditEntry` has `actor_name`, but the API sends `actor_label` ("Name (EMP-ID)"). The admin feature maps it in `actorText()`.
5. `users/` does not return `last_login` or `status`.
   - Workaround: last login comes from `audit-log/?action=auth.login`.
   - "Pending first login" can't be detected. The backend should expose `last_login` and `must_change_password`.
6. `ApuBase.ranger_count` is not returned. The admin feature counts active rangers by `apu_base_id` from `users/?role=ranger`.
7. `Assignment` has no `updated_at`, although the API sends it. The grid `dry_run` features carry `properties.apu_base_id`, which is not in `CellProperties`.
8. `PATCH/POST users/` rejects `phone: null` with "may not be null". The client sends `""` to clear the phone.

## Hooks (`src/api/hooks.ts`)
9. The `audit-log/` endpoint supports `date_from` and `date_to`, but `useAuditLog` has no params for them. It also has an `actor_id` param that the API ignores. `AuditPage` uses a local query.
10. The API ignores `useUsers({ search })`, so users are filtered on the client.
11. Cache invalidation gaps:
    - `useActivateArea` only invalidates `areas`. It should also `setQueryData(qk.area(id))`.
    - `useSaveTeam` should invalidate `qk.area(areaId)` and `qk.areas`, because `team_count` and `setup.teams` change.
    - `useDeleteApuBase` should invalidate `qk.area(areaId)`.

    The admin feature does these invalidations itself.
12. `hooks.useArea` (area detail) has the same name as `AreaContext.useArea` (header switcher), so it has to be imported under an alias. Suggested name: `useAreaDetail`.

## intel

1. **`.overline` class clashes with Tailwind's `overline` utility** (`text-decoration-line: overline`), so every `.overline`
   label also gets a line above the text (visible in `StatsRow`). Rename the component class in `src/styles/index.css`
   (e.g. `.eyebrow`). These features inline `text-label font-semibold tracking-[0.06em] uppercase text-ink-3` instead.
2. **Risk colours differ between map and badges.** `CELL_STYLE` uses low green / medium orange / high + critical red, while
   `SeverityBadge` uses medium blue / high orange / critical red (Design Doc semantic colours). The Intelligence page shows both.
   Align `CELL_STYLE.low|medium|high|critical` with `severityColor`, or document the map ramp as intentional.
3. **types.ts additions seen in real responses** (handled with local types):
   - `AreaRisk`: `requested_date`, `area_id`. `RiskTrendPoint.mean_score` / `max_score` are `number | null`.
   - `Coverage`: `season_start` (`YYYY-MM`), `area_id`; `CoverageSector.never`.
   - `CellProperties`: `centroid` (Point), `area_id`.
   - `Observation.observer_name` is typed but `observations/` does not return it.
4. **hooks.ts**
   - `useSummary`, `useAlerts`, `useUsers` have no `enabled` option. Researchers/viewers therefore trigger 403 requests when a page
     needs these only for managers. Add an `enabled` argument.
   - `useObservations` has no `cell_id` filter. The coverage cell panel loads the month's area observations and filters them in the client.
   - Per-cell score history needs one `areas/{id}/risk/?date=` call per day (see `useRiskHistory.ts`). A `risk/cells/{cell_id}/history/?days=`
     endpoint would cut this to one request.
5. **Role mismatch (backend/router).** `App.tsx` and the sidebar let researchers open `/intelligence` and `/coverage` (PRD 12.1: researcher
   may view the AI risk heatmap), but §7 backend notes make `risk/`, `risk/trend/`, `coverage/` and `coverage/export/` MANAGERS-only
   (403). The pages explain this calmly. Either grant read-only access to researchers in the API, or hide these nav items for them.
6. **scripts/shot.py**: MapLibre canvases render blank in headless Edge. The map fires `load` but never goes `idle` under
   `--virtual-time-budget`, and this happens on every map page. Map layers could not be checked in screenshots.

## ops

1. **AreaMap renders 0 px high** (`src/components/map/AreaMap.tsx`). `maplibre-gl.css` is unlayered and sets
   `.maplibregl-map { position: relative }`. That overrides Tailwind's layered `absolute inset-0` on the inner container,
   so the map collapses to 0 px height. Ideal fix: set the container style inline (`style={{ position: 'absolute', inset: 0 }}`).
   Ops workaround: `MAP_FILL` in `useOpsMap.ts` (`[&>.maplibregl-map]:!absolute`).
2. **Markers drift after the first update** (`renderMarker` in AreaMap.tsx). `el.className = 'piq-marker'` removes the
   `maplibregl-marker` classes MapLibre added, which also removes `position:absolute; top:0; left:0`. Any change to `points`
   or `selectedPointId`, including the 30 s refresh, pushes every marker into normal flow and off its coordinates. Ideal fix:
   use `el.classList.add('piq-marker')`, and set only the needed properties instead of replacing `style.cssText`, because that
   also clears the transform.
   Ops workaround: `MAP_FILL` also sets `.piq-marker` to absolute, top 0, left 0.
3. **`.overline` conflicts with Tailwind** (`src/styles/index.css`). Tailwind v4 has an `overline` utility
   (`text-decoration-line: overline`). It wins over the `@layer components .overline` class, so every `.overline` label
   gets a line drawn above it. `StatsRow` in `ui.tsx` shows this today. Ideal fix: rename the class (e.g. `.label-caps`).
   Ops uses the explicit utilities instead.
4. **`addMapControls` / zoom buttons**: the designs show +/- zoom buttons, but AreaMap adds none. Ops adds a
   `NavigationControl` in `onReady`. Adding it to AreaMap (as an `showZoom` prop) would keep maps consistent.
5. **Type differences in alert responses** (`types.ts`), handled locally:
   - `GET alerts/` list items have no `cell_label`. Ops looks the label up from `areas/{id}/cells/` by `cell_id`.
   - `GET alerts/{id}/` adds `employee_id`, and for threat alerts `category, subtype, species_name, count, patrol_client_uuid`.
     These fields are not in `AlertItem`.
   - Safety alerts have `area_id: null`. `alerts/?area_id=` still includes them for rangers of that area.
   - `useAlerts` `status` accepts only `active | acknowledged`. The "All" tab omits it and filters on the client
     (`resolved`, `cancelled`).
6. **Basemap in headless screenshots**: in headless Edge the OpenFreeMap Liberty sprite never finishes loading, so `load`
   never fires and the maps stay blank in `scripts/shot.py` shots. The `--disable-gpu` flag also blocks WebGL.
   For verification, ops ran its dev server with a sprite-less `VITE_MAP_STYLE_URL` and took real-time CDP screenshots.
   This needs no code change, but `shot.py` could use `--use-angle=swiftshader --enable-unsafe-swiftshader` and wait in real time.

## platform

Differences between the real local API (checked 2026-09-15) and `src/api/types.ts` / `src/api/hooks.ts`. They are handled
inside `src/features/platform/` for now (`platformApi.ts`, `platformLogic.ts`).

## types.ts
1. **`OrgUsage` does not match `GET platform/organisations/{id}/usage/`.** The real body is nested:
   `{ organisation_id, status, seats: { rangers_used, max_rangers, managers_used, max_managers }, areas: { total, active, archived, max_areas }, last_sync_at }`.
   There is no `active_devices` field. Local adapter: `UsageWire` + `normaliseUsage()`.
2. **`PlatformOrganisation` has no `deployment`.** List/detail items include `deployment: 'shared' | 'dedicated'`, and
   `PATCH platform/organisations/{id}/` accepts it. Local type: `PlatformOrg`.
3. **`PlatformOrganisation.usage` is never returned** by the list or detail endpoints. Usage needs one request per organisation.
4. `Licence.status` in responses is the organisation's *effective* status (`active|grace|suspended`). On write,
   `PUT .../licence/` accepts only `active|suspended`.

## hooks.ts
5. **`useCreateOrg` return type is wrong.** `POST platform/organisations/` returns 201
   `{ organisation: PlatformOrg, admin_user: User, temporary_password, totp_secret, totp_uri }`, not
   `PlatformOrganisation & { admin }`. Local type: `CreateOrgResult`. Its body type could be `CreateOrgBody` instead of `Record<string, unknown>`.
6. `useOrgUsage` is typed with the wrong `OrgUsage`. The platform page reads usage with `useQueries` (same `['platform-usage', id]` key).
7. `useSaveLicence` / `useUpdateOrg` should also invalidate `['platform-org', id]` and `['platform-usage', id]`. `useUpdateOrg`
   should invalidate `['platform-licence', id]` too, since a status change alters the licence's effective status.
   The page does this locally with `useInvalidateOrg()`.

## lib/format.ts
8. `fmt.date` formats in local time. Licence dates are whole UTC days (`expires_at` = `23:59:59Z`), so east of UTC
   "30 Sep 2027" shows as "1 Oct 2027". A `fmt.utcDate` would help. Local helper: `licenceDate()`.

## Backend (spec §5 usage)
9. The design and brief expect **active devices** in usage, but the usage endpoint does not return it. The drawer shows it only when the field is present.
10. There is no aggregate endpoint, so the page makes N+1 usage calls. Returning `seats`/`areas` in the list response would fix that.

## reports

1. **types.ts `Report`** is missing the additive v1.3 keys `download_url`, `error` (when `status = failed`) and, on
   `reports/shared/{token}/`, `shared_by_name` and `share_expires_at`. These are handled locally as `ReportWire` in `ReportView.tsx`.
2. **hooks.ts**: add a `useSharedReport(token)` hook with `retry: false`, because 404/410 must not retry. `SharedReportPage.tsx` uses a local `useQuery` for now.
3. **`.overline` CSS class** clashes with Tailwind's `overline` text-decoration utility. See `features/intel/FOUNDATION_REQUESTS.md`.
4. **scripts/shot.py**: headless Edge has no PDF viewer, so the PDF `<iframe>` preview stays grey in screenshots. It renders in a normal browser.
   GeoJSON previews on `AreaMap` are blank for the same MapLibre headless reason noted in the intel requests.
