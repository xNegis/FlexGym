# `07_UI_DESIGN_SYSTEM.md`

# FlexGym UI Design System

## Purpose

This document is the source of truth for FlexGym's user-facing visual and interaction language.
It applies to every feature that creates or changes frontend UI.

The coded design tokens and shared frontend primitives are the executable implementation of this
guide. Feature specifications define product behaviour; they must not invent a parallel visual
language.

FlexGym is used primarily on a phone, often in a gym while the user is standing, moving, fatigued,
or operating the device with one hand. Interfaces must be fast to scan, forgiving to touch, and
quiet enough that the next action is obvious.

## Product Character — Quiet Strength

FlexGym should feel:

* Calm.
* Precise.
* Capable.
* Professional.
* Personal without being playful or intrusive.

It must not resemble a neon bodybuilding site, a generic enterprise dashboard, a social fitness
feed, or a game.

Use strong typography, restrained color, clear hierarchy, generous touch targets, and concise
copy. Decoration is subordinate to comprehension. Data density is acceptable only when progressive
disclosure keeps the immediate task simple.

## Non-negotiable Principles

### 1. Mobile-first

Design from 360 px upward. Desktop is an enhancement, not the reference layout compressed onto a
phone.

### 2. One dominant action

Each screen or contained task has at most one visually dominant action. Secondary and destructive
actions must not compete with it.

### 3. Comfortable touch

Interactive targets must be at least 44 by 44 CSS pixels unless the visible element is contained
inside a larger labelled control that meets the target size.

Actions frequently used during a workout should normally be 48–56 pixels high.

### 4. Meaning beyond color

Status, validation, selection, and destructive meaning must always include text, iconography,
shape, or another non-color cue.

### 5. Shared states

Loading, empty, error, pending, success, unavailable, and confirmation states use shared patterns.
Features must not create visually unrelated versions of the same state.

### 6. Quiet destructive actions

Destructive actions remain visually secondary until the user enters an explicit destructive
confirmation. The confirmed destructive action may then use the danger treatment.

### 7. Progressive disclosure

Show the information required for the immediate decision first. Advanced planning fields remain
available but do not receive the same visual prominence as common fields.

### 8. Accessible by default

Use native semantics, logical headings, visible keyboard focus, labelled controls, appropriate
announcements, and sufficient contrast. Accessibility is part of completion, not a later polish
pass.

### 9. No local visual invention

Do not introduce a new color, radius, shadow, spacing scale, button treatment, field treatment, or
interaction pattern inside a feature. Extend this guide and the coded system explicitly when a
genuinely reusable need exists.

### 10. Fast workout interaction

Workout tracking must not feel like form completion. Future live-workout screens prioritize large
controls, minimal typing, immediate feedback, and interruption recovery.

## Design Foundations

### Color

The approved direction uses:

* A warm off-white application canvas.
* White and subtly tinted surfaces.
* Charcoal primary text.
* Muted neutral secondary text.
* A deep evergreen accent.
* Restrained semantic colors for success, warning, and danger.

Use semantic CSS custom properties. Feature CSS must not contain raw hex, RGB, HSL, or named color
values.

Required semantic roles include:

```css
--color-canvas
--color-surface
--color-surface-subtle
--color-surface-raised
--color-text
--color-text-muted
--color-text-subtle
--color-border
--color-border-strong
--color-accent
--color-accent-strong
--color-accent-soft
--color-on-accent
--color-success
--color-success-soft
--color-warning
--color-warning-soft
--color-danger
--color-danger-strong
--color-danger-soft
--color-focus
--color-overlay
```

The exact values belong in a single token file. Red is reserved for errors and confirmed
destructive actions. Green success styling must remain distinguishable from the evergreen product
accent through accompanying labels and context.

Dark mode is not required until explicitly specified. Tokens must nevertheless avoid component
assumptions that make a future dark theme unnecessarily difficult.

### Typography

Use one application font stack. Prefer a locally available or locally bundled variable sans-serif
with a system fallback. Do not depend on a third-party font CDN for core rendering.

The initial implementation may use Inter Variable or the following system-oriented fallback:

```css
font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Supported semantic roles:

| Role | Intended use |
|---|---|
| Display | Authentication brand or exceptional empty-state emphasis |
| Screen title | Current screen or entity |
| Section title | Major content group inside a screen |
| Subsection title | Nested group such as an exercise prescription section |
| Body | Default readable content |
| Compact body | Dense metadata and list support text |
| Label | Form labels and small control labels |
| Caption | Timestamps, hints, units, and supporting metadata |

Body text must not be smaller than 14 px. Core inputs and actions use at least 16 px on mobile to
support readability and avoid unwanted mobile-browser zoom. Captions may use 12–13 px only for
non-essential supporting information.

Use sentence case for headings and actions. All-caps is limited to short status badges with modest
letter spacing. Do not communicate hierarchy solely through font weight.

### Spacing

Use a 4 px-based token scale:

```css
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.25rem;
--space-6: 1.5rem;
--space-8: 2rem;
--space-10: 2.5rem;
--space-12: 3rem;
```

Normal mobile page gutters are 16 px. They may become 24–32 px on wider viewports. Components must
not introduce arbitrary intermediate spacing values.

### Shape, Borders, and Elevation

Use a small radius scale for controls, cards, and modal surfaces. Pills are reserved for badges,
filters, and compact segmented states, not general containers.

Borders define structure more often than shadows. Use shadows sparingly for raised navigation,
dialogs, bottom sheets, or an intentionally elevated primary surface. Avoid stacking multiple card
layers without a clear hierarchy.

### Iconography

Use one icon family throughout the product. Lucide is the preferred initial family because it is
consistent, lightweight, and accessible when wrapped correctly.

Icons must:

* Use a consistent stroke weight and approved sizes.
* Accompany text when meaning may be ambiguous.
* Have an accessible name when used without visible text.
* Be hidden from assistive technology when purely decorative.

Do not use emoji as product icons. Do not author isolated custom SVG icons when the approved family
already contains an appropriate concept.

### Motion

Motion communicates state changes and spatial relationships. It is not decoration.

* Use brief transitions, normally 120–220 ms.
* Prefer opacity and transform over layout-heavy animation.
* Do not delay task completion for animation.
* Respect `prefers-reduced-motion: reduce`.
* Loading indicators must not create distracting continuous motion when a static skeleton or status
  is sufficient.

## Application Structure

### Authenticated App Shell

Authenticated screens use one shared shell containing:

1. A compact contextual header.
2. One primary scrollable content region.
3. Bottom navigation on mobile.
4. A wider but constrained content column on desktop.

The global FlexGym brand must not consume large vertical space on every authenticated screen. The
header prioritizes the current screen or entity and only exposes actions relevant at that level.

Content uses the available mobile width with standard gutters. Do not restore the previous global
320 px maximum. Forms may use a narrower readable measure on desktop, while lists and planning
screens may use a wider measure.

### Primary Navigation

The current authenticated destinations are:

* Plan — routine management and the active training plan.
* Exercises — catalog browsing and exercise detail.
* Profile — fitness profile and account-level actions.

Use these labels consistently. Do not alternate between `Plan` and `Routines` for the primary
destination; `Routines` may remain a screen or section title within Plan.

Mobile uses bottom navigation because it is reachable with one hand. It must:

* Identify the current destination with text and a non-color visual cue.
* Include visible text labels, not icons alone.
* Respect `env(safe-area-inset-bottom)`.
* Remain above content without obscuring the final interactive element.
* Contain only implemented destinations.

Phase 2 may add Today when a real workout entry flow exists. F12 must not introduce an empty Today
destination or imply that workout execution already exists.

Desktop may adapt the same destinations into a side rail or top-level navigation when that improves
the available layout. It must preserve labels and information architecture.

### URL and Back Behaviour

Meaningful navigation state belongs in URLs. At minimum this includes:

* Authentication screens.
* Primary authenticated destinations.
* Exercise detail.
* Routine detail.
* Training-day exercise configuration.

Browser Back and mobile back gestures must reverse meaningful navigation. Refreshing a valid
protected URL restores the same destination after authentication and profile checks. Dialog open
state and temporary inline editing do not require independent URLs.

Authentication guards must not briefly expose protected content. Invalid or inaccessible entity
URLs produce a recoverable not-found state with a clear route back.

### Page Hierarchy

Use this order when applicable:

1. Screen header: back/navigation affordance, title, optional concise subtitle, optional contextual
   action.
2. Primary status or action.
3. Main task content.
4. Secondary information and settings.
5. Destructive or account-level actions, visually separated.

Avoid repeating the same title at shell and page level. Avoid centering long-form content or list
headings; left alignment is the default for application screens.

## Approved UI Primitives

The implementation agent must create and reuse shared equivalents of the following. Names may vary
slightly when code conventions require it, but their roles must remain explicit.

### Layout

* `AppShell` — authenticated header, content, navigation, and safe areas.
* `AuthLayout` — focused unauthenticated and onboarding presentation.
* `Page` — responsive page width and gutters.
* `ScreenHeader` — title, description, back action, and optional contextual action.
* `Section` — labelled group with consistent vertical rhythm.
* `Stack`, `Inline`, and `Grid` — constrained layout composition using spacing tokens.
* `StickyActionBar` — long-form terminal actions when persistent access materially helps mobile use.

### Actions

`Button` variants:

* Primary — the single dominant action.
* Secondary — an important alternative.
* Ghost — navigation, cancellation, or low-emphasis action.
* Danger — confirmed destructive action only.

Supported sizes should remain few and purposeful. Every variant defines default, hover where
applicable, pressed, `focus-visible`, disabled, and pending states.

`IconButton` requires an accessible name and the same 44 px target contract. It is appropriate for
recognizable compact actions such as Back or Close, not for ambiguous domain actions.

Text links are used for navigation, not to disguise mutations.

### Forms

Shared form primitives include:

* `Field` with label, optional marker, hint, error, and stable described-by relationships.
* `TextInput`.
* `NumberInput` with visible unit where applicable.
* `Select`.
* `TextArea`.
* `Checkbox` or `Switch` only when the domain genuinely requires a boolean choice.

Placeholders are examples, not labels. Required and optional conventions must be consistent.
Backend validation remains authoritative. A failed request preserves entered values and focuses or
announces the relevant error without moving the user to a global failure screen.

Long forms are grouped into meaningful sections. Do not create fake multi-step onboarding unless
the feature explicitly defines saved progress or a step contract. A single scrolling form with
clear groups is preferable to decorative steps that can lose data.

### Surfaces and Data Display

* `Card` — one coherent entity or grouped decision.
* `ListRow` — compact navigable item.
* `Badge` — short explicit status.
* `KeyValueList` — readable profile or metadata summary.
* `Divider` — separation only when spacing is insufficient.
* `Disclosure` — advanced or secondary content that can be expanded safely.

Cards must not contain nested cards by default. A clickable card has one primary navigation target;
secondary actions inside it require careful event and focus handling and should usually move to the
detail screen.

### Feedback

* `Alert` — error, warning, or success message associated with a task.
* `InlineMessage` — compact field or section-level information.
* `EmptyState` — explains what is absent and, when possible, how to resolve it.
* `LoadingState` or `Skeleton` — preserves the expected page shape without showing false empty
  content.
* `Dialog` — consequential confirmation or focused decision.
* `BottomSheet` — mobile presentation of a dialog or compact secondary controls.

Do not use toast notifications for errors that require action or for information the user must
retain. Transient success feedback may use a toast later if a shared implementation is introduced;
F12 does not require one.

## Interaction and State Contract

### Loading

Initial and entity-level loading must not briefly display false inactive, empty, or rest states.
Use a labelled status or skeleton matching the expected structure. Keep existing confirmed content
visible during a contained refresh when doing so cannot misrepresent state.

### Empty

An empty state contains:

* A concise statement of what is absent.
* A short explanation only when useful.
* One primary action only when the user can resolve the state.

Do not use motivational filler or invented recommendations.

### Error

Show errors at the smallest boundary that owns recovery. Mutation failures remain inside the
current flow and preserve confirmed data and entered values. The full-screen backend-unavailable
state is reserved for application bootstrap failure.

Error copy states what failed and what the user can do. Never expose raw server values, stack
details, internal enum values, or malformed response content.

### Pending

Pending actions:

* Prevent duplicate or conflicting submission.
* Keep their location and approximate width stable.
* Use explicit labels such as `Saving…` or `Activating…`.
* Do not optimistically claim success before a validated response when the existing feature
  requires confirmed state.

### Confirmation

Consequential confirmations name the affected entity and describe the consequence. They provide
separate Cancel and confirm actions.

Dialogs and bottom sheets must:

* Use appropriate dialog semantics.
* Move focus inside when opened and restore focus to the trigger when closed.
* Keep keyboard focus contained while open.
* Close with Escape when cancellation is safe.
* Prevent background interaction and scrolling.
* Remain open with recoverable error feedback after a failed request.

Browser-native `window.confirm` is not allowed.

## Domain-specific Patterns

### Authentication

Authentication screens use a focused layout with restrained brand presence, a clear title, a short
supporting sentence when useful, and one primary submit action. Login and registration switching is
visible but secondary.

Password-manager autocomplete, paste, validation preservation, and backend-unavailable recovery
remain mandatory.

### Profile and Onboarding

Group profile information into:

* Body — date of birth, biological sex, height, weight, and optional body fat.
* Training — experience, goal, days per week, and preferred duration.
* Preferences and constraints — training environment and physical limitations.

Profile summary uses the same groups rather than one undifferentiated list. Account email, logout,
and profile deletion are separated from fitness facts. Edit profile is the primary profile action;
Delete profile is placed in a distinct danger area.

Metric units remain explicit. F12 does not introduce imperial units, calculated metrics, medical
interpretation, or additional profile facts.

### Exercise Catalog

Search is the dominant catalog control. Filters are compact and may use a disclosure or mobile
sheet, provided active filters remain visible and clearable.

Exercise rows prioritize:

1. Exercise name.
2. Primary muscle.
3. Equipment.

Detail presents the name and execution guidance before secondary taxonomy. Friendly labels remain
mandatory. Search and filters remain preserved when returning from detail.

F12 does not add images, videos, favorites, fuzzy search, or suitability recommendations.

### Plan and Routines

Routine list cards show:

* Name.
* Objective.
* Training-session count.
* Explicit active status when applicable.

The active routine is prominent but not styled as a completed workout or recommendation. Routine
detail separates:

1. Routine identity and active status.
2. Activate, switch, or deactivate action.
3. Weekly schedule.
4. Routine settings and destructive actions.

Edit and Delete must not compete visually with Activate or Switch.

### Weekly Schedule

All seven Monday-to-Sunday positions remain visible because the weekly cycle is canonical domain
information.

Rest positions are compact. Training positions expose the session name and exercise count as the
primary content. Opening exercise configuration is the primary row action. Rename, move, and delete
are secondary controls and may live behind an overflow or contextual action surface when this
improves mobile clarity without hiding their availability.

Moving to an occupied position must still communicate swap semantics. Drag-and-drop may not be the
only mechanism.

### Exercise Prescription

Configuration remains a planning surface, not a record of performed work.

Show common information first:

1. Exercise and target type.
2. Target shorthand and generated set count.
3. Per-set target value, planned load, and RIR.
4. Exercise-level rest and notes.

Tempo, set notes, and other advanced optional values should use progressive disclosure while
remaining fully editable. Apply-to-all controls must be clearly associated with the value they
change and must not become a dense row of unlabeled inputs.

Mobile set editing uses stacked set cards and never requires horizontal scrolling. Destructive set
reduction keeps its explicit warning and separate final Save requirement.

### Future Live Workout Surfaces

Phase 2 live-workout screens must optimize for:

* One-handed use.
* Large numeric controls.
* Minimal text entry.
* Obvious current exercise and set.
* Clear completed and remaining state.
* Fast access to rest timing and feedback.
* Recovery after refresh, interruption, or accidental navigation.

Do not copy planning-screen density into workout execution.

## Responsive Contract

Every changed UI flow must be validated at:

* 360 px width.
* 390 px width.
* 430 px width.
* A representative tablet or small desktop width.
* A representative wide desktop width.

There must be no document-level horizontal overflow. Local horizontal scrolling is allowed only
for content whose meaning genuinely requires it and never for core forms, schedules, actions, or
set editing.

Account for:

```css
env(safe-area-inset-top)
env(safe-area-inset-right)
env(safe-area-inset-bottom)
env(safe-area-inset-left)
```

On-screen keyboards must not permanently obscure the focused control or terminal form action.
Layouts must support 200% zoom without losing task functionality.

## Accessibility Contract

Every UI feature must verify:

* Logical landmarks and heading order.
* Visible `focus-visible` treatment on every interactive element.
* Keyboard access to all actions, including reorder alternatives.
* Accessible names for icon-only controls.
* Labels and described-by relationships for fields, hints, and errors.
* Appropriate `status`, `alert`, and dialog announcements.
* WCAG AA contrast for text and essential controls.
* State and selection that do not rely on color.
* Touch targets meeting the mobile contract.
* Reduced-motion behaviour.

Do not add ARIA when native HTML already provides the correct semantics. Disabled controls that
require explanation must have adjacent visible explanatory text; a `title` attribute alone is not
sufficient.

## Content and Language

The current product UI remains English until localization is explicitly designed. Do not mix
English and Spanish inside the application. Internal enum values are never user-facing.

Copy should be:

* Concise.
* Specific to the current task.
* Calm rather than celebratory.
* Explicit about permanent or plan-changing consequences.
* Free of generic coaching claims and invented recommendations.

Use consistent verbs: Create, Save, Edit, Activate, Switch, Deactivate, Delete, Cancel, Retry, and
Back. Use ellipsis characters in pending labels where appropriate.

## Implementation Boundaries

The initial coded system should prefer:

* Plain React and TypeScript.
* Semantic CSS custom properties.
* A small shared primitive layer.
* Locally scoped feature composition styles.
* One approved icon dependency when needed.

Do not introduce a large UI framework, utility-class framework, CSS-in-JS runtime, bespoke theming
engine, or Storybook unless a later explicit decision demonstrates the need.

Global CSS should contain reset, tokens, typography, application shell, and truly global primitive
behaviour. Feature-specific composition should not accumulate again in one monolithic stylesheet.

The implementation should make violations difficult:

* Tokens live in one discoverable file.
* Shared controls live in one discoverable UI directory.
* Feature code composes primitives instead of recreating raw variants.
* Automated checks should reject raw feature colors when practical.

## UI Feature Specification Checklist

Every feature that creates or changes UI must answer:

* What is the user's primary task on each screen?
* What is the single dominant action?
* Which approved primitives are reused?
* Is any proposed new primitive genuinely reusable?
* What are the loading, empty, error, pending, success, and unavailable states?
* What happens after a malformed or unexpected API response?
* Which actions require confirmation?
* How does Browser Back behave?
* What remains visible while a request is pending or fails?
* Is the flow operable by keyboard and touch at all required widths?
* Is status understandable without color?
* Were safe areas, keyboard obstruction, zoom, and horizontal overflow checked?

## Implementation Review Checklist

Before a UI feature is marked complete:

* [ ] The implementation reuses the coded token and primitive system.
* [ ] No feature-local raw colors or arbitrary spacing scale were introduced.
* [ ] The primary action and information hierarchy are clear.
* [ ] All applicable request and empty states were exercised.
* [ ] Destructive and consequential confirmations preserve context and recovery.
* [ ] Browser Back and refresh behave predictably for meaningful destinations.
* [ ] Keyboard focus is visible and logical.
* [ ] Touch targets meet the minimum size.
* [ ] The flow has no horizontal overflow at 360, 390, and 430 px.
* [ ] A representative desktop layout was inspected.
* [ ] Status does not rely on color alone.
* [ ] User-facing copy follows the language and terminology contract.
* [ ] Relevant automated checks and focused browser validation pass.

## Governance

Changes to this guide are architectural decisions, not incidental styling. When a feature needs to
extend the system, update this document, the coded tokens or primitives, and the feature
specification in the same change.

Prefer the simplest existing pattern that satisfies the task. A one-off product need does not
automatically justify a new permanent primitive.
