# F22 — Body Weight Tracking

## Objective

Let a user record body weight as a simple, free-standing history of dated facts. The feature makes capture quick, keeps exactly one editable measurement for each local calendar date, and makes that history the source of the current body weight shown in Profile.

## Context

F03/F04 collect `weight_kg` in the fitness profile, where it is currently a mutable snapshot with no history. F20/F21 established Progress as the factual-history area. F22 introduces dated body-weight measurements but neither relates them to routines/workouts nor interprets a change.

New onboarding already asks for height and weight. On successful profile creation, F22 records that entered weight as the user's first measurement for their supplied current local date. Profiles that already exist when F22 is deployed have no known measurement date, so migration retains their stored profile value only as an undated fallback and must not create a fictional historical row.

F22.1 owns body-progress photos. F23 owns body-weight charts, shared period selection, changes, and any deterministic trend presentation.

## User Experience

`/progress/body-weight` is a protected Body weight section alongside Workouts, Exercises, and Statistics. It shows the current weight, one compact recording form, and a chronological history. The date defaults to the user's current local date and can be changed to an earlier date. The user enters kilograms with one decimal precision and may add a note. `Save measurement` is the single dominant action.

Saving a date that already has a measurement replaces that date's stored weight and note; it never creates a second same-day row. The history starts with five newest entries, then adds older entries through `Load more`. Each entry shows its date, weight, and optional note. The user may correct its weight/note or delete it through explicit confirmation; its date is not editable.

The screen is text-based factual history. It has no graph, range selector, calculated change, target, routine/workout association, photo picker, reminder, or judgement.

## Functional Requirements

### FR-1 — Progress route

Add protected `/progress/body-weight` and a `Body weight` link to the shared Progress section navigation on each of the four Progress sections. `/progress` continues to redirect to `/progress/workouts`; primary navigation is unchanged. Refresh restores this route. Add/edit/delete UI is temporary state, so Browser Back only changes meaningful navigation.

### FR-2 — One measurement per date

An authenticated user with a fitness profile can save a required local `measurement_date`, required `weight_kg`, and optional `note`. The client supplies a `current_local_date` for future-date validation, as already established for local-date flows. The default form date is that local current date; earlier dates are permitted and future dates are rejected.

There is exactly one owned measurement for each local date. A supported save for a date without an entry creates it; saving for an existing date replaces only its weight and note atomically. The measurement date is immutable after creation. The UI makes clear when Save will replace the existing date's value rather than silently presenting it as a second observation.

### FR-3 — History and correction

Return owned measurements newest date first through opaque cursor pagination, initially five items. `Load more` appends the next page without duplicates or reordered confirmed items. An empty history is factual and retains the record form.

An entry's edit UI changes weight and note only. A delete dialog identifies the date and weight, states that the measurement will be permanently removed, and offers separate Cancel and Delete measurement actions. Pending controls prevent repeats; failed saves preserve entered values, and a failed delete preserves the confirmation with recoverable feedback.

### FR-4 — Current Profile weight

Profile has one current body weight, resolved at read time:

* If the user has measurements, it is the weight for the latest measurement date.
* If none remain, it is the persisted undated fallback from their profile.
* Saving, replacing, or deleting a measurement refreshes the resolved value immediately. Deleting the latest measurement therefore returns the previous date's weight, or the undated fallback if no earlier measurement exists.
* The Profile summary labels it `Current body weight` and shows `Recorded on {date}` only when it comes from a measurement.
* General Profile edit no longer shows or submits body weight. It directs the user to Body weight.

The normal onboarding create flow retains the initial required `weight_kg` field and simultaneously creates the first dated measurement. Existing pre-F22 profile values never appear as invented history items.

### FR-5 — Ownership and lifecycle

All measurement operations require cookie authentication and an existing fitness profile. A client never supplies a user or profile ID. A missing or another user's measurement returns `404` without disclosing its existence. Measurements belong directly to the user, not a routine, workout, or mutable profile record.

F04 profile deletion retains its existing scope: it does not delete the user or their other owned history, including body-weight measurements. After re-onboarding, retained measurements again determine current body weight.

## Domain / Data Requirements

Introduce `BodyWeightMeasurement` with numeric ID, indexed user foreign key, local `measurement_date`, decimal `weight_kg`, nullable `note`, and server-owned creation/update timestamps. Enforce unique `(user_id, measurement_date)` at database level and index the owned chronological query. Use a decimal-capable column, not binary floating point.

Do not add a routine/workout relation, image/file record, trend, target, aggregate, or a second persisted current-weight value. Existing `FitnessProfile.weight_kg` remains only the no-history fallback; the current response is resolved from the latest measurement when present.

The migration adds only the table, ownership/uniqueness constraints, and indexes. It does not backfill any rows for existing profiles.

## API Requirements

All frontend API functions validate success shapes and pagination invariants from `unknown` input, and normalize error bodies before React renders them.

### `GET /api/body-weight-measurements`

Optional opaque `cursor` and bounded `limit` query parameters return `current_weight`, `items`, and `next_cursor`. The current summary contains `weight_kg`, source (`measurement` or `profile_fallback`), and nullable `measurement_date`. The default page limit is five. Malformed, repeated, unknown, or out-of-range query parameters return framework-compatible `422`.

### `PUT /api/body-weight-measurements/{measurement_date}`

The path date and body containing exactly `current_local_date`, `weight_kg`, and `note` create or replace the user's one measurement for that date. Return `201` for creation and `200` for replacement, in both cases with the saved item and recomputed current-weight summary. Return `401` when unauthenticated, `404` when no profile exists, and `422` for malformed date/input or unknown fields.

### `DELETE /api/body-weight-measurements/{measurement_date}`

Delete the owned measurement for that date and return `204`. Return `401` when unauthenticated and `404` for missing, unowned, or profile-less requests.

### Existing profile API

`GET /api/fitness-profile` keeps `weight_kg` as the resolved current body-weight field and adds nullable `current_weight_measurement_date`. `POST /api/fitness-profile` adds required `current_local_date` so it can create the initial same-day measurement atomically with the profile. `PUT /api/fitness-profile` accepts all remaining editable profile fields except `weight_kg`; sending it is rejected as unknown. Its response still includes resolved current weight.

## UI Requirements

F22 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and reuses `AppShell`, `AppHeader`, `Page`, `Section`, `Stack`, `Inline`, `SectionNav`, `Card`, `ListRow`, `Button`, `Field`, `NumberInput`, native labelled date input, `TextArea`, `Alert`, `EmptyState`, `LoadingState`, and `Dialog`. It adds no visual primitive, raw color, local button treatment, range control, or chart.

Mobile order is Progress/navigation, current-weight context, recording form, history, then Load more. The form is retained in an empty state. Loading retains expected shapes without false empty content. List failures show `Unable to load body-weight history. Please try again.` with contained Retry. Save/edit failures retain drafts; delete failures retain the dialog. Pending actions state `Saving…` or `Deleting…` and prevent duplicates.

Profile summary replaces `Body weight` with `Current body weight`, including the recorded date when known, and provides `Record body weight`. Profile edit explains that body weight is managed in Progress. Onboarding keeps its required weight field.

Validate loading, empty, initial creation, same-date replacement, previous-date creation, edit, delete confirmation, current-weight fallback, error/malformed response, pagination, refresh, and Back at 360 px, 390 px, 430 px, and representative desktop. Verify keyboard access, visible focus, 44 px targets, safe areas, 200% zoom, and no document-level horizontal overflow.

## Business Rules

* A measurement is a factual body observation, never a plan, target, score, or interpretation.
* Kilograms with one decimal are the only supported unit.
* A user has zero or one measurement per local date; a later save replaces that date's facts.
* Latest date, not creation time, determines current weight.
* Notes are unclassified private user context.
* No measurement date is invented for existing profile values.
* F22 adds neither photos nor charts and must not communicate that gain/loss is good or bad.

## Validation

`measurement_date` and `current_local_date` must each be exactly one real `YYYY-MM-DD`; a measurement date cannot be later. `weight_kg` is a finite JSON number from 20 to 500 inclusive with at most one decimal; booleans, strings, non-finite values, and excess precision are invalid. `note` is null or trimmed text up to 1,000 characters, with blank input normalized to null. Backend validation remains authoritative.

Because F22 adds a migration, validate fresh isolated history and isolated upgrade from F21 head, verify the schema/unique index and absence of invented data, exercise an authenticated API/UI flow against migrated data, compare configured local `alembic current` to `alembic heads`, and verify a repeat supported migration is safe.

## Acceptance Criteria

* [ ] Progress exposes Body weight without primary-navigation or existing Progress-route regressions.
* [ ] Onboarding atomically creates its initial dated measurement; existing profiles receive none.
* [ ] Users can create/replace one dated measurement, view five newest entries, load older ones, edit weight/note, and confirmed-delete any owned entry.
* [ ] Profile displays the latest dated measurement or its undated fallback exactly as specified.
* [ ] No future date, duplicate date, date edit, chart, period control, routine relation, photo, reminder, target, or interpretation is introduced.
* [ ] Authentication, ownership, missing-profile, Profile edit/delete, and historical workout flows retain correct behaviour.
* [ ] Fresh/upgrade migration gates, backend tests, static checks, and focused manual UI validation pass.

## Tests

Backend tests cover onboarding atomic creation, no migration backfill, creation/replacement, date ordering/pagination, validation, edit, deletion/fallback, ownership, missing profile, resolved Profile values, changed Profile update contract, and fresh/upgrade migration paths. ORM metadata-created tables do not satisfy migration validation.

Per DEC-019, F22 adds no automated browser coverage. Frontend format, lint, and type checks cover strict parser and profile-contract changes. Focused manual validation covers the specified request, empty, pending, failure, accessibility, Back/refresh, and responsive states.

## Out of Scope

* F22.1 body-progress photos, uploads, FTP, object storage, image viewing, and analysis.
* F23 chart, ranges, period deltas, smoothing, trends, forecasts, and targets.
* Body-fat/composition tracking, BMI, medical advice, routine/workout relation, nutrition correlation, export, sharing, reminders, signals, coaching, or AI.

## Dependencies

F02 Authentication; F03 Fitness Profile; F04 Profile Management; F12 UI system; F20/F20.1/F21 Progress information architecture.

## Notes

Read-time resolution avoids competing current-weight sources while preserving undated pre-F22 data honestly. The one-date upsert contract represents the agreed “keep the latest measurement of the day” behaviour explicitly rather than relying on creation-time inference.
