# F29 — Native Mobile Packaging and Private iOS Distribution

## Objective

Package the existing FormCadence React/Vite frontend as installable iOS and Android applications
with Capacitor while preserving the deployed web application, REST API, domain behaviour, and
current frontend architecture.

The first delivered native artifact is a privately distributed iOS build installed on the product
owner's physical iPhone through TestFlight. Android receives the same package identity and generated
native project, but Google Play publication is not part of this feature.

## Context

FormCadence is already a production HTTPS web application at `https://formcadence.app`. Its
mobile-first React 19 / TypeScript / Vite frontend talks to a FastAPI backend and authenticates with
a seven-day JWT held in an HTTP-only, Secure, SameSite=Lax cookie. It also uses browser camera/file
inputs for private body-progress photos, Web Audio for the best-effort rest cue, Screen Wake Lock
when available, URL-backed React Router navigation, and safe-area CSS.

The product owner has an active individual Apple Developer Program membership, has registered the
explicit App ID `app.formcadence`, and has created the corresponding iOS app record in App Store
Connect. Development happens on Windows without a local Mac or Xcode, so signed iOS archives will
be produced by Codemagic on hosted macOS infrastructure.

The prior architectural preference for an initial PWA has served the MVP. F29 changes distribution,
not the frontend framework: the existing web UI remains the shared application and Capacitor adds
thin native containers around its compiled assets.

## User Experience

### Installation

The product owner installs Apple's TestFlight app, accepts the private FormCadence test invitation,
and installs FormCadence as an independent application with its own icon and name on the iPhone.

### Application use

Launching FormCadence loads bundled frontend assets and connects over HTTPS to the existing
`formcadence.app` API. Login, authenticated refresh/relaunch, logout, navigation, workout execution,
camera/gallery photo selection, private photo upload/viewing, rest audio, and supported screen wake
lock retain their existing product behaviour.

An unavailable API uses the existing recoverable unavailable state. The application does not load
the production website as a remote WebView and does not require Safari to be open.

### Existing web application

The browser application remains deployable and usable at `https://formcadence.app`. Native
packaging must not replace, redirect, or otherwise change normal web delivery.

## Functional Requirements

### FR-1 — Capacitor integration

Add the current stable Capacitor core, CLI, iOS, and Android packages to the frontend project. A
committed TypeScript Capacitor configuration must define:

* App ID `app.formcadence` for both platforms.
* App name `FormCadence`.
* Vite's `dist` directory as the packaged web directory.
* Bundled local assets for production; `server.url` must not point at the deployed website.
* Native HTTP handling for absolute mobile API requests.

Generate and commit conventional Capacitor iOS and Android projects. Native projects remain build
artifacts owned by the repository and must be updated through documented build/sync commands rather
than hand-copied web output.

### FR-2 — Separate web and mobile build configuration

Normal `npm run build` remains the browser build and defaults to same-origin API requests when no
`VITE_API_BASE_URL` is supplied. It must not fall back to a developer's LAN address.

A reproducible mobile build command compiles the same source with the public HTTPS API base URL
`https://formcadence.app`, then synchronizes the output into the native projects. The public API URL
is configuration, not a secret. Developer-local overrides remain uncommitted.

### FR-3 — Preserve HTTP-only cookie authentication

Native requests must use Capacitor's supported native HTTP bridge so server `Set-Cookie` responses
are stored and sent on subsequent requests even though the packaged WebView has a local origin.

F29 must not:

* expose the JWT to frontend JavaScript;
* move authentication into `localStorage`, `sessionStorage`, or Preferences;
* change the backend cookie to `SameSite=None` merely for packaging;
* disable TLS validation; or
* embed credentials, signing material, or API secrets in the application bundle.

The existing browser request path and cookie behaviour remain unchanged because Capacitor's bridge
is active only in native builds.

### FR-4 — Native identity and minimum platform metadata

Both native projects use `app.formcadence` and the visible name `FormCadence`. No user-facing native
or frontend copy introduced or touched by F29 may present the old FlexGym name.

Use the existing restrained evergreen FormCadence mark as the MVP source for generated application
icons and launch assets. Final brand artwork is not required for the first private TestFlight build.

iOS must contain clear purpose descriptions for camera and photo-library access used by the existing
private body-progress-photo flow. It requests no unrelated capability or entitlement.

### FR-5 — Existing device-facing web capabilities

Do not replace working browser implementations pre-emptively. The existing file/capture inputs,
Web Audio rest cue, Screen Wake Lock feature detection, safe areas, and BrowserRouter flows remain
the first native implementation. Unsupported or denied device capabilities continue to fail within
their existing bounded behaviour rather than breaking workout or navigation state.

Any capability found not to work on the physical iPhone must be reported from device validation and
handled through a focused follow-up; F29 must not silently add broad native plugins.

### FR-6 — iOS cloud build and signing

Add a Codemagic configuration that:

* checks out the repository on hosted macOS;
* installs the locked frontend dependencies;
* runs the mobile web build and Capacitor synchronization;
* resolves iOS native dependencies using the generated project's supported package manager;
* uses App Store Connect API integration and automatic signing for `app.formcadence`;
* builds an App Store Connect distribution archive; and
* publishes the resulting IPA to the existing App Store Connect app/TestFlight record.

Signing certificates, provisioning profiles, App Store Connect private keys, issuer IDs, key IDs,
and other secrets must live only in Codemagic encrypted/integration storage. They must never be
committed or pasted into project documentation.

### FR-7 — Private TestFlight delivery

The first build is distributed only through TestFlight internal testing to the product owner's
Apple account. Public App Store release, external beta recruitment, and marketing metadata are not
required. The build may remain in Apple's `Prepare for Submission` state for public distribution.

### FR-8 — Developer documentation

Document the Windows-compatible workflow for installing dependencies, producing web/mobile assets,
synchronizing Capacitor, and opening/building Android once Android Studio is installed. Document
that iOS compilation requires Codemagic/macOS and cannot be completed locally on Windows.

The documentation must distinguish public non-secret configuration from credentials and must not
include real account passwords or signing material.

## Domain / Data Requirements

F29 introduces no fitness-domain entities, persistence, backend migration, or new user-owned data.
Native installation state and the operating system's protected cookie store are infrastructure
concerns rather than application-domain records.

## API Requirements

No endpoint or response contract changes. The native application calls the existing HTTPS API.
The backend continues to issue the current HTTP-only authentication cookie and enforce all existing
ownership and validation rules.

The production API must not require a permissive wildcard CORS policy. Native HTTP requests do not
justify weakening the existing browser origin allowlist.

## UI Requirements

F29 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and introduces no new screen, primitive, or
visual convention. The primary task and dominant actions on every screen remain those of the
existing feature specifications.

The only frontend copy change is replacement of remaining user-facing `FlexGym` references with
`FormCadence`. Existing loading, empty, error, pending, unavailable, confirmation, focus, Back,
keyboard, touch-target, safe-area, zoom, and responsive behaviour must remain intact.

Native validation covers 360 px, 390 px, and 430 px-equivalent phone widths through representative
devices where available, with particular attention to notch/home-indicator safe areas, software
keyboard obstruction, document-level horizontal overflow, and iOS text zoom. Existing browser
desktop behaviour receives regression validation but no redesign.

## Business Rules

* `app.formcadence` is the permanent native application identity on iOS and Android.
* FormCadence is the only user-facing product name after F29.
* One React/Vite source application continues to serve web, iOS, and Android.
* Native production builds contain bundled versioned assets and use the existing hosted API.
* TestFlight is private distribution for the current MVP, not public App Store publication.
* Apple signing is performed on hosted macOS; Windows remains the primary development environment.
* Authentication tokens remain inaccessible to application JavaScript.

## Validation

Automated/local validation must include:

* Existing frontend tests, formatting, linting, type checking, and browser build.
* A production-mode mobile Vite build using `https://formcadence.app`.
* Capacitor configuration validation and synchronization for both generated native projects.
* Inspection proving generated native identifiers/names match the registered values.
* Inspection proving no secret or developer-local API address enters committed configuration or
  packaged mobile assets.
* Existing backend tests only if backend code changes; F29 does not require a database migration.

Hosted validation must include a successful signed Codemagic iOS archive and upload to the
`app.formcadence` App Store Connect record.

Physical iPhone validation must cover:

* Cold launch and relaunch from the independent FormCadence icon.
* API health/bootstrap and the unavailable/retry path where practical.
* Login, authenticated relaunch, logout, and login again.
* Navigation, visible Back actions, refresh/relaunch recovery, and representative core reads and
  mutations.
* Camera cancellation/capture, gallery selection, private photo upload, viewing, and deletion.
* Asset loading, safe areas, keyboard use, absence of horizontal overflow, and 200% text zoom.
* Rest cue behaviour and best-effort screen wake lock during an in-progress workout.

Physical Android compilation/device validation is a later delivery gate once the local Android
toolchain is installed; the generated Android project and shared configuration must nevertheless
remain synchronized in F29.

## Acceptance Criteria

* [ ] Existing browser production and local development builds remain reproducible.
* [ ] Capacitor packages and committed iOS/Android projects use `app.formcadence` and `FormCadence`.
* [ ] The mobile bundle contains compiled local assets and targets `https://formcadence.app` for API
  calls without a LAN fallback.
* [ ] Native login preserves the existing HTTP-only cookie across API calls and app relaunch without
  exposing the JWT to JavaScript.
* [ ] Remaining user-facing FlexGym references in the changed application surface are FormCadence.
* [ ] Required MVP application icons, launch assets, and iOS privacy purpose strings are present.
* [ ] Codemagic produces and uploads a correctly signed iOS build to the existing App Store Connect
  record without committed credentials.
* [ ] The product owner can install and launch FormCadence through private internal TestFlight.
* [ ] The focused physical-iPhone authentication, navigation, data, photo, audio, wake-lock, asset,
  safe-area, keyboard, zoom, and overflow checks have explicit results.
* [ ] No public App Store release, backend migration, authentication redesign, or unrelated native
  capability is introduced.

## Tests

Do not add automated browser coverage under DEC-019. Reuse existing frontend unit tests and static
checks, and add focused configuration/script tests only where they protect an important packaging
boundary without duplicating Capacitor itself.

Codemagic's clean macOS build is the iOS compilation test. The product owner's physical iPhone
execution is required for native-only behaviour that Windows and static inspection cannot verify.

## Out of Scope

* Public App Store submission, App Review, pricing, territories, screenshots, marketing copy, and
  production release.
* External TestFlight testing or beta review.
* Google Play Console registration, Android signing/release, or Play Store publication.
* React Native/Expo migration or a second mobile UI codebase.
* Loading the deployed website through a production `server.url` WebView.
* Offline-first data, background synchronization, push/local notifications, HealthKit, Apple Watch,
  widgets, Live Activities, subscriptions, in-app purchases, biometrics, or social login.
* Broad conversion of web camera, audio, wake-lock, or navigation behaviour to native plugins before
  device evidence requires it.
* Renaming historical feature documents, database filenames, migration history, repository paths,
  or internal compatibility constants that are not user-facing.
* Final brand/marketing artwork beyond a valid private-MVP icon and launch presentation.

## Dependencies

F01 Project Infrastructure; F02 User Authentication; F12 Mobile-first UI System; F22.1 Body
Progress Photos; F26 Rest Countdown Focus and Audio Cue; F26.1 Active Workout Screen Wake Lock; the
existing production HTTPS deployment; Apple Developer membership; registered App ID
`app.formcadence`; and the matching App Store Connect app record.

## Notes

Capacitor is an additive native runtime, not a frontend rewrite. Native projects are intentionally
committed because signing, platform metadata, privacy strings, and future focused native extensions
must remain reviewable and reproducible.

The native HTTP bridge is selected specifically to preserve the existing server-owned HTTP-only
cookie boundary. Physical-device authentication remains a completion gate because WebView and
operating-system cookie behaviour cannot be proven solely from Windows.
