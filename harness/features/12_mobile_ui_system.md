# F12 — Mobile-first UI System and Phase 1 UX Refresh

## Objective

Replace the organically accumulated Phase 0–1 interface with a coherent mobile-first application
shell, reusable UI system, and predictable navigation model before workout tracking begins.

F12 changes presentation, information hierarchy, and frontend navigation. It must preserve the
domain behaviour, API contracts, validation rules, ownership boundaries, and persistence semantics
implemented by F02–F11.

Completion of F12 should leave the repository with both:

* A clean, professional, touch-friendly interface for every existing flow.
* An enforceable frontend foundation that future harness agents can extend consistently.

## Context

Phase 1 is complete. The current frontend supports authentication, profile onboarding and
management, exercise catalog browsing, routine CRUD, active-routine selection, weekly scheduling,
and detailed exercise prescriptions.

The implementation grew incrementally with each feature. It is functional but has no explicit
design system or durable application navigation model. The current baseline includes:

* One global `App.css` of approximately 1,600 lines and hundreds of feature-oriented selectors.
* Repeated raw buttons, form controls, cards, messages, and confirmation layouts.
* Visual classes coupled to their first feature, such as `auth-button`, reused in unrelated flows.
* Many hard-coded colors and two competing primary blues.
* A global 20 rem content maximum that makes authenticated screens resemble narrow forms.
* A vertically centered shell and large repeated brand heading rather than an application shell.
* Predominantly 12–14 px interface text and several controls below a comfortable touch size.
* Only one limited responsive breakpoint and no bottom safe-area navigation.
* Primary navigation and most detail flows represented only by React component state, so browser
  Back, refresh, and shareable internal URLs do not reflect meaningful navigation.
* Large feature components containing several complete screens and confirmation subviews.

The architecture already states that the frontend is mobile-first because future workout tracking
will happen predominantly from a phone. Phase 2 will add interaction-heavy execution screens, so
the visual and navigation foundation should be corrected before those features are specified.

`harness/context/07_UI_DESIGN_SYSTEM.md` is normative for this feature. The implementation agent
must read it completely before changing frontend code.

## User Experience

### Unauthenticated Flow

An unauthenticated visitor sees a focused branded authentication surface rather than the
authenticated app shell.

Login is the default public destination. Registration is clearly available as a secondary
navigation action. Successful login or registration continues through the existing profile check.

Backend-unavailable state remains recoverable and visually belongs to the same product. Form
validation and request failures preserve field values and remain near the form.

### Onboarding Flow

An authenticated user without a fitness profile sees a readable onboarding form grouped into:

* Body.
* Training.
* Preferences and constraints.

This is one scrolling form, not a fake multi-step wizard. The user can review all information before
submitting, validation does not discard values, metric units remain explicit, and logout remains
available.

### Authenticated Shell

An authenticated user sees:

* A compact contextual header.
* Main content using the available phone width with consistent gutters.
* Bottom navigation for Plan, Exercises, and Profile.
* Safe-area padding so navigation and final page actions are not obscured.

The current destination is explicit through label, icon, and visual state. Desktop adapts the same
information architecture without returning to a 320 px-wide application.

No Today, dashboard, or workout destination is shown because Phase 2 behaviour does not yet exist.

### Profile Flow

Profile summary groups saved values into Body, Training, and Preferences and constraints. Edit
profile is the clear primary action.

Email and logout appear in a separate Account area. Delete profile appears in a visually separated
danger area and remains secondary until confirmation.

Edit mode uses the same grouped field composition as onboarding. Success returns to the refreshed
summary. Cancel and failures retain the existing F04 behaviour.

### Exercise Catalog Flow

The catalog opens with a strong screen title and dominant search input. Muscle and equipment
filters are compact, understandable, and clearable. Active filtering remains evident without
requiring the full filter form to dominate the screen.

Results use touch-friendly list rows that prioritize exercise name, primary muscle, and equipment.
Loading, no matches, failure, and result count are visually distinct.

Exercise detail prioritizes the name and execution instructions, followed by structured metadata.
Returning through the visible Back action or browser Back preserves catalog criteria during the
current application session.

### Plan and Routine Flow

The primary navigation destination is named Plan. Its first screen may retain `Routines` as the
screen title.

Routine cards show name, objective, training-session count, and explicit active status. The active
routine is recognizable without relying on color. Creating a routine is the list's primary action.

Routine detail separates:

1. Routine identity and active status.
2. The relevant Activate, Switch, or Deactivate action.
3. Weekly schedule.
4. Routine settings, including edit and delete.

Empty-routine activation guidance remains visible and must say that at least one training day is
required. It must not claim exercises are required.

### Weekly Schedule Flow

The schedule continues to show all seven Monday-to-Sunday positions. Rest positions are compact.
Training positions prioritize session name and exercise count.

Opening exercise configuration is the primary session action. Rename, move, and delete remain easy
to discover but receive lower visual prominence. The move control preserves explicit swap wording
for occupied targets and remains fully usable without drag-and-drop.

Adding a training day remains below the schedule and explains earliest-available-day placement.

### Exercise Prescription Flow

The training-day screen presents configured exercises in clear order with target summary and set
count. Opening an exercise configuration is the primary row action. Reordering remains keyboard and
touch usable.

The add flow reuses catalog search and filters. Already configured exercises remain visibly
unavailable.

The editor presents common prescription information first:

1. Target type.
2. Target shorthand.
3. Generated set cards.
4. Common per-set load and RIR values.
5. Exercise-level rest and notes.

Tempo and other advanced optional set fields remain fully supported but are progressively
disclosed. Apply-to-all controls are labelled, associated with one value, and do not form a dense
unstructured toolbar.

The mobile editor never requires horizontal scrolling. Set-reduction and exercise-deletion warnings
retain their existing consequences and recovery behaviour.

### Confirmations

Consequential confirmations use a shared accessible dialog surface, presented as an appropriate
mobile dialog or bottom sheet and as a centered dialog on larger screens.

This applies to:

* Profile deletion.
* Routine deletion.
* Training-day deletion.
* Configured-exercise deletion.
* Active-routine switching.
* Active-routine deactivation.

The existing documented consequence copy remains semantically accurate. A failed request leaves the
confirmation open, preserves confirmed application state, and allows retry or cancellation.

## Functional Requirements

### FR-1 — Design tokens

Create one discoverable frontend token layer covering:

* Semantic color roles.
* Typography roles.
* Spacing scale.
* Control and layout sizing.
* Radii.
* Borders.
* Elevation.
* Motion.
* Layering.
* Safe areas.
* Responsive content widths.

Feature composition styles must consume semantic tokens. Raw colors must not remain scattered
through feature styles.

### FR-2 — Shared primitive layer

Create a small shared UI directory containing reusable equivalents of the primitives defined by
`07_UI_DESIGN_SYSTEM.md`.

At minimum the implementation must centralize:

* Application and authentication layouts.
* Screen header and responsive page container.
* Button and icon-button variants.
* Field labels, hints, errors, and common inputs.
* Card or list-row surfaces.
* Badges.
* Alerts and inline messages.
* Loading and empty states.
* Accessible confirmation dialog.

Feature components compose these primitives. They must not duplicate raw generic button, field,
alert, or dialog variants under feature-specific class names.

The implementation may use native elements inside the primitives and should avoid abstraction that
does not correspond to a repeated visual or interaction need.

### FR-3 — Style organization

Replace the monolithic accumulated stylesheet with clear boundaries:

* Global reset, tokens, typography, and shell styles.
* Shared primitive styles.
* Locally scoped feature composition styles.

CSS Modules or an equivalently simple locally scoped mechanism are acceptable. Do not introduce a
utility CSS framework, CSS-in-JS runtime, or comprehensive third-party component framework.

Temporary compatibility selectors may exist during implementation but must be removed before F12
is completed. The finished UI must not depend on `auth-*` classes for non-authentication controls.

### FR-4 — Icon system

Use one consistent icon family. Lucide React is the approved default if a dependency is required.

Icons must follow the sizing, labelling, decorative, and touch-target rules in the design guide.
Remove the Vite starter icon and supply an intentional minimal FlexGym application icon or
wordmark treatment without introducing unrelated branding work.

### FR-5 — Authenticated app shell

Implement the shared authenticated shell with:

* Contextual header.
* Main landmark.
* Responsive content widths.
* Mobile bottom navigation.
* Desktop adaptation.
* Top and bottom safe-area handling.
* Sufficient page-bottom padding so navigation never covers content or actions.

The shell must not render on login, registration, backend-unavailable, or onboarding screens.

### FR-6 — Route model

Introduce a simple explicit client-side route model. A maintained lightweight routing library is
acceptable and preferred over a growing custom history implementation.

Required canonical paths:

* `/login`
* `/register`
* `/onboarding`
* `/plan`
* `/plan/routines/new`
* `/plan/routines/:routineId`
* `/plan/routines/:routineId/edit`
* `/plan/routines/:routineId/days/:trainingDayId/exercises`
* `/exercises`
* `/exercises/:slug`
* `/profile`
* `/profile/edit`

Confirmation dialogs and small inline-edit states do not require canonical routes.

Authentication and profile guards determine valid access:

* Unauthenticated access to a protected path redirects to login.
* An authenticated user without a profile is redirected to onboarding.
* An authenticated user with a profile who opens login, registration, or onboarding is redirected
  to the authenticated default destination.
* Successful authentication respects an originally requested valid protected destination when this
  can be implemented simply and safely; otherwise it opens Plan.
* Successful profile creation opens Plan.
* Logout opens Login and removes protected screen state.

Refreshing a canonical protected URL restores that destination after bootstrap. Invalid numeric
IDs, unknown entities, or inaccessible entities use recoverable not-found behaviour without
disclosing ownership.

### FR-7 — Browser Back and transient state

Browser Back and mobile back gestures must:

* Return from exercise detail to the preserved catalog state.
* Return from routine detail to the routine list.
* Return from routine or profile editing without silently saving.
* Return from training-day exercise configuration to its routine detail.
* Move predictably between primary destinations visited through navigation.

Closing a confirmation returns focus to its trigger without adding a meaningless history entry.
Unsaved form protection beyond the existing explicit Cancel behaviour is not required by F12.

### FR-8 — Authentication migration

Restyle and compose registration, login, application loading, and backend-unavailable states using
the new foundations.

Preserve:

* All fields and validation.
* Password autocomplete behaviour.
* Generic credential failure.
* Duplicate-email handling.
* Pending submission prevention.
* Health retry behaviour.
* Authentication restoration.

### FR-9 — Profile migration

Restyle and regroup onboarding, summary, edit, delete confirmation, and account actions without
changing any F03 or F04 field, enum, validation rule, API request, or deletion effect.

### FR-10 — Catalog migration

Restyle catalog list, filters, counts, loading, no-results, failure, detail, and not-found states.
Preserve search/filter request behaviour, race protection, criteria preservation, friendly labels,
and response normalization.

### FR-11 — Routine migration

Restyle routine list, empty state, create, detail, edit, activation, switching, deactivation,
deletion, and failure flows. Preserve every F07 and F11 rule and confirmation consequence.

### FR-12 — Weekly schedule migration

Restyle all-rest, populated, loading, move, swap, rename, create, delete, and schedule-failure states.
Preserve every F08 and F10 rule, the seven-position model, and confirmed-server-state behaviour.

### FR-13 — Exercise configuration migration

Restyle exercise list, catalog picker, configuration editor, set cards, apply-to-all controls,
set-reduction warning, deletion confirmation, loading, empty, limit, and failure states.

Preserve every F09 field and behaviour. Progressive disclosure must not discard hidden values or
change submitted payloads.

### FR-14 — Responsive interaction

All migrated flows must work at 360, 390, and 430 px without document-level horizontal overflow.

Core controls meet the 44 px target contract. Navigation and persistent actions account for safe
areas. Desktop layouts use additional width intentionally; they must not simply stretch every field
or card to the viewport.

### FR-15 — Accessibility

Implement the complete accessibility contract from the design guide, including:

* Logical landmarks and heading order.
* Visible `focus-visible` styling.
* Keyboard-operable navigation, dialogs, reordering, and forms.
* Accessible icon-only controls.
* Correct field error associations.
* Appropriate alert and status announcements.
* Dialog focus management and restoration.
* Non-color status.
* Reduced-motion support.

### FR-16 — Request and response safety

F12 must continue using the existing frontend API layer. Components never call backend URLs
directly and never render raw response bodies.

Visual refactoring must not weaken response parsing, normalized error handling, typed not-found
outcomes, confirmed-state updates, or duplicate-submission protection.

### FR-17 — Harness governance

Update project documentation so every future UI-affecting feature is required to read and follow
`07_UI_DESIGN_SYSTEM.md`.

The feature template must require UI specifications to name:

* Mobile hierarchy and primary action.
* Reused and new primitives.
* Applicable request and content states.
* Touch, keyboard, focus, safe-area, and overflow behaviour.
* Browser Back behaviour when navigation changes.

## Domain / Data Requirements

F12 introduces no domain entities, database tables, persisted fields, reference data, or data
migration.

Frontend route state is presentation state and must not be treated as a new domain fact.

## API Requirements

No backend endpoint, request payload, success response, error response, authentication behaviour,
or cookie behaviour changes.

The existing frontend API boundary remains the only backend integration surface for React
components.

F12 must not modify backend code merely to simplify visual implementation. If an existing API
contract makes an essential F12 flow impossible, stop and raise the conflict rather than silently
expanding scope.

## UI Requirements

### Visual Direction

Implement the Quiet Strength direction exactly as described in `07_UI_DESIGN_SYSTEM.md`:

* Warm neutral canvas.
* Restrained surfaces and borders.
* Charcoal text hierarchy.
* One deep evergreen primary accent.
* Semantic danger, warning, and success roles.
* Strong left-aligned application hierarchy.
* Minimal elevation and decoration.
* Consistent iconography.

Do not add stock fitness imagery, decorative exercise photography, gradients, glassmorphism, neon
effects, gamification, social proof, streaks, or invented performance data.

### Content Widths

Use at least three intentional layout measures:

* Compact — authentication and focused simple forms.
* Reading/form — profile forms and exercise detail.
* Planning — routine schedule and prescription editing.

All use full available mobile width minus gutters. The implementation chooses tokenized maximums
that provide comfortable desktop reading and editing. A universal 20 rem maximum is prohibited.

### Loading and Skeletons

Loading UI must not show false data. In particular:

* Routine loading cannot show every routine inactive.
* Schedule loading cannot show seven rest days.
* Catalog loading cannot show zero results.
* Profile bootstrap loading cannot show onboarding before absence is confirmed.

Skeletons are optional. If used, they must share primitive styling, preserve expected layout, and
respect reduced motion.

### Dialog Presentation

The shared confirmation primitive must be responsive. It may render as a bottom sheet on mobile and
a centered dialog on desktop, provided semantics and focus behaviour remain equivalent.

Confirmation text may be reorganized for readability but must retain every consequence required by
F04, F08, F09, F10, and F11.

### Advanced Prescription Disclosure

Collapsing advanced set fields is presentation-only:

* Existing values remain in local editable state while collapsed.
* Validation errors automatically reveal the affected advanced section.
* Saving submits the same complete configuration.
* Cancelling retains existing F09 semantics.
* The feature must not infer defaults that F09 did not define.

### Browser Metadata

Replace Vite starter metadata with FlexGym-specific title, description, theme color, and intentional
icon references. Set document language consistently with the current English UI.

F12 does not require a service worker, offline cache, install prompt, or complete PWA manifest.

## Business Rules

All business rules from F02–F11 remain unchanged.

In particular:

* F12 does not create, activate, select, modify, or delete user data automatically.
* Active routine remains an explicit current-plan selection, not a workout fact.
* A routine still needs at least one assigned training day, not configured exercises, to activate.
* The weekly cycle still contains exactly seven Monday-to-Sunday positions.
* Exercise configuration remains planned prescription, not performed work.
* Hidden advanced fields remain part of the complete edited prescription.
* Consequential changes still require the documented explicit confirmations.
* Failed mutations preserve previously confirmed application and persisted state.

## Validation

No Alembic migration validation is required because F12 changes no persistence.

Validation must include:

### Static quality

* Frontend formatting.
* ESLint.
* TypeScript type checking.
* Production build.
* No unused compatibility styles or abandoned primitive variants.
* No remaining Vite starter branding.

### Responsive browser validation

Exercise representative flows at 360, 390, and 430 px and at representative desktop widths.

For every required mobile width:

* `document.documentElement.scrollWidth` must not exceed its client width during core flows.
* Bottom navigation must not obscure the last actionable element.
* Dialogs and the on-screen-keyboard layout must remain usable.
* Core targets must meet the touch-size contract.

### Interaction validation

Verify:

* Keyboard traversal and visible focus.
* Dialog focus containment, Escape cancellation, and trigger focus restoration.
* Browser Back and refresh for canonical routes.
* Reduced-motion behaviour.
* Non-color active and error state.
* One representative malformed or unexpected API response for every materially migrated request
  boundary, using existing API parsing tests or focused inspection where automation is impractical.

### Regression validation

Run the existing backend test suite even though backend code should remain unchanged. Exercise the
main frontend success and representative failure paths for authentication, profile, catalog,
routines, schedule, active selection, and exercise configuration.

## Acceptance Criteria

### Foundations and governance

* [ ] Every current screen uses the semantic token and primitive system.
* [ ] Generic controls are no longer styled through feature-origin names such as `auth-button`.
* [ ] Feature styles contain no raw colors and do not introduce an independent spacing scale.
* [ ] The old monolithic stylesheet has been replaced by clear global, primitive, and feature
  boundaries.
* [ ] Future UI features are required by project instructions and the feature template to follow
  `07_UI_DESIGN_SYSTEM.md`.

### Shell and navigation

* [ ] Authenticated screens use the responsive app shell and unauthenticated screens do not.
* [ ] Mobile bottom navigation exposes only Plan, Exercises, and Profile and identifies the current
  destination without color alone.
* [ ] Navigation and final actions respect mobile safe areas and never obscure page content.
* [ ] The application no longer uses a universal 20 rem content maximum.
* [ ] Every required canonical path loads or redirects according to authentication and onboarding
  state.
* [ ] Refreshing a protected entity path restores it after bootstrap.
* [ ] Browser Back works for exercise detail, routine detail, routine/profile editing, and
  training-day exercise configuration.

### Authentication and profile

* [ ] Login, registration, unavailable, retry, authentication restoration, and logout retain F02
  behaviour in the new visual system.
* [ ] Onboarding and profile editing group fields into Body, Training, and Preferences and
  constraints without changing fields or payloads.
* [ ] Profile summary uses the same groups and never exposes raw enum values, nulls, IDs, or
  timestamps.
* [ ] Account actions are separated from fitness facts and Delete profile remains visually
  secondary until confirmation.
* [ ] Failed profile submission, update, or deletion preserves the documented values and recovery.

### Exercise catalog

* [ ] Search is the dominant catalog control and active filters remain understandable and clearable.
* [ ] Loading, results, no matches, list failure, detail failure, and not-found states are distinct.
* [ ] Exercise rows prioritize name, primary muscle, and equipment and meet the touch target
  contract.
* [ ] Exercise detail prioritizes instructions and presents every required friendly metadata value.
* [ ] Returning from detail preserves current catalog criteria.

### Plan and routines

* [ ] Routine list, empty, create, detail, edit, delete, activation, switching, and deactivation
  retain all F07 and F11 behaviour.
* [ ] Active status is explicit in list and detail without relying on color.
* [ ] Routine detail has a clear primary status action; edit and delete do not compete with it.
* [ ] An empty routine visibly explains the one-training-day activation requirement.
* [ ] Failed activation or switching preserves the previously confirmed active routine.

### Weekly schedule

* [ ] All seven Monday-to-Sunday positions remain visible and ordered.
* [ ] Rest positions are explicit and compact without being mistaken for loading placeholders.
* [ ] Training positions prioritize session name, exercise count, and opening exercise configuration.
* [ ] Rename, move/swap, create, and delete remain keyboard- and touch-usable.
* [ ] Move controls communicate occupied-target swap behaviour.
* [ ] Schedule failure preserves routine metadata and provides retry.

### Exercise prescription

* [ ] Configured-exercise list, catalog picker, limits, ordering, edit, and deletion retain all F09
  behaviour.
* [ ] Every target type, set value, planned load, RIR, tempo, rest, note, and exercise-level field
  remains editable and persists unchanged in meaning.
* [ ] Advanced disclosure never drops hidden values and reveals fields containing validation errors.
* [ ] Apply-to-all controls are individually labelled and understandable.
* [ ] Set editing requires no horizontal scrolling at required mobile widths.
* [ ] Set-reduction warning and final Save remain separate decisions.

### Accessibility and responsive behaviour

* [ ] Every interactive element has a visible logical keyboard focus state.
* [ ] Shared dialogs contain focus, support safe Escape cancellation, and restore trigger focus.
* [ ] Core controls meet the 44 by 44 px touch target contract.
* [ ] Status, selection, validation, and destructive meaning do not rely on color.
* [ ] All required flows have no document-level horizontal overflow at 360, 390, and 430 px.
* [ ] Representative flows remain functional at 200% zoom and with reduced motion.

### Regression and scope

* [ ] Frontend formatting, linting, type checking, production build, and focused browser tests pass.
* [ ] Existing backend formatting, linting, type checking, and tests pass without F12 backend
  behaviour changes.
* [ ] No dashboard, Today screen, workout execution, analytics, recommendations, or AI behaviour is
  introduced.
* [ ] No backend endpoint, database migration, domain entity, or persisted field changes.

## Tests

F12 is the point at which the previous blanket deferral of frontend browser coverage should end for
stable cross-feature shell behaviour. Keep coverage focused rather than attempting exhaustive UI
testing.

Add automated browser coverage for:

### Public and guard flow

* Unauthenticated login and registration navigation with meaningful paths.
* Protected-path redirect to login.
* Authenticated user without a profile reaching onboarding.
* Authenticated profiled user reaching Plan and being redirected away from public/auth-only paths.

### Authenticated navigation

* Plan, Exercises, and Profile navigation at a 390 px mobile viewport.
* Current-destination semantics and visible labels.
* Exercise catalog to detail and browser Back with preserved criteria.
* Routine list to detail and browser Back.
* Direct refresh of one entity route.

### Responsive contract

One representative content-rich fixture should verify no document-level overflow at 360, 390, and
430 px for:

* Profile summary or edit.
* Exercise catalog.
* Routine weekly schedule.
* Exercise prescription editor.
* Confirmation dialog.

### Accessibility interaction

* Keyboard-visible focus on primary navigation and actions.
* Confirmation dialog opening focus, Tab containment, Escape cancellation, and focus restoration.
* At least one active/status state whose accessible text does not depend on color.

### Regression strategy

Existing backend tests remain the authoritative coverage for business behaviour. Browser tests
should use normal APIs and isolated test setup rather than duplicating backend validation variants.

Do not add brittle full-page screenshot snapshots for every state. A small number of deliberate
visual baselines for the app shell and most complex mobile planning screen is acceptable if fonts
and fixtures are deterministic. Manual visual inspection remains required before completion.

## Out of Scope

* Start workout, live workout, set completion, rest timer, skip flow, feedback, discomfort, workout
  completion, or history.
* Today dashboard or selection of a workout from the active routine.
* Progress charts, adherence, streaks, analytics, body history, or derived signals.
* Adaptation suggestions, AI coaching, recommendations, or plan generation.
* New profile fields, imperial units, localization infrastructure, or translation to Spanish.
* Custom exercises, exercise images or videos, favorites, or suitability recommendations.
* Routine templates, duplication, import, export, sharing, archive, or collaboration.
* Changes to routine activation readiness, schedule semantics, exercise configuration semantics, or
  deletion effects.
* Backend refactoring, API changes, new persistence, or database migrations.
* Offline caching, service workers, push notifications, install prompts, or a complete PWA feature.
* Dark mode.
* A large component framework, utility CSS framework, CSS-in-JS runtime, bespoke theming engine, or
  Storybook.
* Publishing or deployment changes.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F05 — Exercise Catalog.
* F07 — Routine Creation.
* F08 — Training Day Management.
* F09 — Routine Exercise Configuration.
* F10 — Routine Schedule.
* F11 — Active Routine.

F06 remains intentionally skipped and adds no dependency.

## Notes

Treat this as a frontend stabilization feature, not an opportunity to introduce Phase 2 product
ideas. Implementation may proceed internally in foundations, shell, screen migrations, and
validation slices, but F12 is complete only when every existing screen has migrated; a permanently
mixed old/new visual system is not an acceptable endpoint.

Prefer simple composition over a highly generic component API. Shared primitives own appearance,
accessibility, and common interaction states. Feature components continue to own domain-specific
composition and request state.
