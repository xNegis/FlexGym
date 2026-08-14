# F22.1 — Body Progress Photos

## Objective

Let a user attach a small, private, ordered set of body-progress photographs to an existing body-weight measurement. The feature provides deliberate capture, useful factual browsing, and permanent removal while keeping sensitive image content private and outside the relational database.

## Context

F22 introduced one user-owned body-weight measurement per local date at `/progress/body-weight`. F22.1 associates zero to five photographs with one of those measurements without changing the measurement's weight, note, date, current-weight resolution, or pagination semantics.

The current deployment uses a private Amazon S3 bucket. The application accesses it through the standard S3 API with a dedicated least-privilege IAM identity restricted to one configured object prefix. Browser clients never receive AWS credentials, bucket URLs, object keys, or direct S3 access.

Body-progress photos are sensitive factual records. F22.1 does not interpret appearance, infer composition, compare dates, use images for AI, or change F23's body-weight visualization scope.

## User Experience

Each body-weight history entry shows its photo count and a secondary `Add photos` or `Manage photos` action. That action opens the protected route `/progress/body-weight/{measurement_date}/photos`. A measurement must exist before photos can be added; saving a measurement and uploading photos are deliberately separate operations so a partial file transfer cannot make the weight save ambiguous.

The photo screen identifies the measurement date and weight, recommends front, side, and back views without requiring them, and accepts any zero-to-five user-selected images. Pressing `Add photos` opens a focused action sheet with `Take a photo`, `Choose from device`, and `Cancel`. `Take a photo` delegates to the device's native camera; `Choose from device` opens the native gallery/file picker and permits multiple selection. No custom in-application camera view is introduced.

Every captured or chosen file joins one local draft before upload. The draft shows previews, selection order, `N photos selected`, and the remaining capacity after accounting for already stored photos. Draft photos can be removed or reordered. Camera capture adds one photo at a time and may be repeated until capacity is reached; gallery selections may fill any remaining capacity in one operation. The combined draft is uploaded only when the user presses `Upload photos`.

One stored photo is shown at a useful size at a time, with compact previous/next controls and selectable thumbnails when more than one exists. The user can deliberately delete the selected photo through confirmation. Deleting the parent measurement also deletes all associated photographs and the existing measurement confirmation states that consequence when applicable.

## Functional Requirements

### FR-1 — Measurement photo route and entry points

Add protected `/progress/body-weight/{measurement_date}/photos`. Refresh restores the same measurement photo screen. Browser Back returns to Body weight and preserves the normal F22 route; photo selection, the currently viewed photo, and confirmation dialogs remain temporary UI state and do not create history entries.

Every loaded F22 history item exposes `photo_count` from zero through five. Its secondary photo action opens the photo route. A missing, malformed, profile-less, or unowned measurement produces a recoverable not-found state with `Back to body weight`.

### FR-2 — Optional ordered photographs

An owned measurement may retain zero to five photos. Orientation labels and specific views are never required. The initial order of a newly uploaded batch is the order confirmed in its preview; new photos append after existing photos. The user may atomically reorder the complete stored set through explicit Move previous/Move next controls. Drag-and-drop may be added only as an enhancement and may not be the sole reorder mechanism.

Replacing the weight or note for an existing date retains its photos because it retains the same measurement. Deleting and later recreating that date creates a new measurement with no inherited photos.

### FR-3 — Native camera and device-selection flow

The frontend owns two visually hidden native file inputs activated only by labelled buttons:

* `Take a photo` uses a single-file image input with the supported image accept hints and `capture="environment"`, requesting the outward-facing camera as the preferred device. The operating system may allow the user to switch cameras. Each successful return adds one file to the draft and exposes `Take another photo` while capacity remains.
* `Choose from device` uses the same image accept hints with `multiple` and no `capture`, allowing the operating system to present its gallery or file picker.

The accepted hints cover `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, and `.heif` and their corresponding image MIME types. They improve the native picker but do not replace backend content validation.

The `capture` attribute is a progressive enhancement and is not treated as universally available. On a supporting phone it requests native camera capture; on an unsupported browser or desktop it may fall back to a normal file picker. The flow remains usable through `Choose from device` in every supported browser. F22.1 does not request a live `getUserMedia` stream, render a camera viewport, switch cameras itself, or manage continuous camera permission state.

Cancelling either native picker makes no state change and shows no error. The input value is reset after every selection so the same native action can be opened again. If a gallery selection exceeds remaining capacity, none of that newly selected group is added; the existing draft is retained and the UI states exactly how many spaces remain. Removing a draft photo immediately frees one space.

Draft files and preview object URLs exist only in browser memory. Back, refresh, logout, or leaving the photo route discards them after revoking every object URL. They are never cached as application data, persisted locally, or uploaded before `Upload photos` confirmation.

### FR-4 — Private upload and normalization

The browser uploads selected files to the authenticated FlexGym backend through `multipart/form-data`; it never uploads directly to S3. The backend authorizes the parent measurement, bounds the request, validates the decoded image rather than trusting its extension or declared MIME type, and normalizes every accepted image before storage.

Accepted input formats are JPEG, PNG, WebP, HEIC, and HEIF. For multi-frame or live-photo containers, only the primary still frame is retained. The backend applies the captured orientation, converts the image to sRGB JPEG, removes source EXIF, XMP, IPTC, GPS, device, filename, and other source metadata, limits the longest edge to 2,560 pixels without upscaling, and writes JPEG at quality 90. No original upload is retained.

A batch is user-atomic: all files must validate and fit the remaining capacity before any photo becomes visible. If processing, object storage, or metadata persistence fails, none of the batch appears and confirmed existing photos remain unchanged. Uploaded objects from a failed batch are removed immediately or entered into the durable deletion-retry path.

### FR-5 — Authenticated viewing

Photo metadata responses contain an opaque photo ID, display order, dimensions, byte size, creation timestamp, and an application content path. They never contain the S3 bucket, region, key, URL, original filename, or source metadata.

Photo bytes are streamed through an authenticated, ownership-scoped backend endpoint. Responses use `Content-Type: image/jpeg`, inline disposition, and `Cache-Control: private, no-store`. A missing, deleted, pending-deletion, or another user's photo returns `404` without disclosing its existence. S3 failures return a contained unavailable response and do not expose provider details.

### FR-6 — Deliberate and resilient deletion

Deleting one photo requires a dialog that identifies its position and measurement date, explains that it will be permanently removed, and provides separate Cancel and `Delete photo` actions. On confirmation, the photo becomes inaccessible atomically with creation of a durable object-deletion task. S3 deletion is then attempted immediately and is idempotently retried if storage is unavailable.

Deleting a body-weight measurement performs the same operation for all its photos. Database metadata must not be deleted in a way that loses the object keys required for eventual cleanup. A successful API deletion may complete after access has been revoked even when physical S3 cleanup has been queued; the user never regains access to the queued object.

Deleting only the fitness profile retains F22 measurements and their photos, consistent with F22. Re-onboarding restores access through the retained owned measurement history.

### FR-7 — Storage isolation and configuration

Only the backend accesses S3. It uses a dedicated storage service boundary built on Boto3 and the normal AWS credential provider chain. Configuration supplies the region, private bucket, and fixed prefix; credentials remain runtime secrets and are never committed, returned by an API, logged, or persisted in application tables.

The deployed IAM principal may list only the configured prefix and may get, put, and delete only objects beneath it. The bucket retains full Block Public Access, bucket-owner-enforced ownership, no ACL use, default SSE-S3 encryption, disabled versioning, and no Object Lock. FlexGym adds no public bucket policy or browser CORS configuration.

Object keys use a stable logical hierarchy:

`{configured_prefix}/users/{user_storage_namespace}/measurements/{measurement_date}/{photo_uuid}.jpg`

`user_storage_namespace` is a server-generated random UUID assigned once to the user for object-storage organization. It is not the numeric database user ID, email, account ID, or another user-supplied value. `measurement_date` is safe to use as the second grouping component because F22 makes it immutable. `photo_uuid` keeps every object unique, including when a measurement is deleted and later recreated for the same date. The application persists the complete key, never a provider URL.

The hierarchy is operational organization, not the primary application index. Normal photo listing queries SQLite through the owned measurement and its indexed `(measurement_id, display_order)` rows, then performs exact-key S3 reads. It never scans the bucket or calls `ListObjects` to render a measurement. Prefix listing is reserved for bounded operational validation, reconciliation, backup, or future account-level cleanup.

The photo feature may report an unavailable state when storage configuration or S3 is unavailable without making authentication, workouts, Profile, or text-based body-weight history unavailable.

## Domain / Data Requirements

Add a nullable unique, server-owned `photo_storage_namespace` UUID to `User`, allocated atomically on the user's first photo upload and then immutable. Existing users receive no eager backfill and users without photos require no storage namespace. The namespace exists only to group private object keys; it is never returned by an API.

Introduce `BodyProgressPhoto` with an opaque UUID identifier, parent `measurement_id`, unique opaque `object_key`, zero-based `display_order`, normalized `content_type`, `byte_size`, `width`, `height`, and server-owned creation timestamp. Ownership is canonical through `BodyWeightMeasurement.user_id`; clients never supply a user, profile, measurement ID, storage namespace, object key, or storage location.

Enforce unique `(measurement_id, display_order)` and at most five supported photos per measurement. The service validates the count transactionally; concurrent writes may not exceed it. All stored photo content is normalized JPEG.

Introduce the minimum durable deletion record required to retain an object key after user-visible metadata is removed. It records no image bytes or user-supplied text. S3 `DeleteObject` is idempotent, successful cleanup removes the deletion record, and pending cleanup is retried during supported startup/deployment cleanup and subsequent photo mutations. Cleanup failure is logged without credentials or sensitive object content.

The migration adds photo metadata, constraints/indexes, and deletion-retry persistence only. It does not create objects, backfill measurements, or invent photos.

## API Requirements

All endpoints require cookie authentication and an existing fitness profile. Parent measurement and photo ownership are resolved from the authenticated user. Missing or unowned resources return `404`. Frontend API functions validate success bodies from `unknown`, normalize framework and application errors, reject malformed IDs, ordering, or metadata, and never render raw response values.

### `GET /api/body-weight-measurements/{measurement_date}/photos`

Return the owned measurement summary, ordered photo metadata, count, and remaining capacity. Return `401` when unauthenticated, `404` for a missing profile or missing/unowned measurement, and `422` for a malformed date or unexpected query parameters.

### `POST /api/body-weight-measurements/{measurement_date}/photos`

Accept one to five repeated `photos` multipart fields, bounded by the measurement's remaining capacity. Return `201` with the complete ordered photo collection after every file is normalized, stored, and confirmed. Return `409` when the count would exceed five, `413` when the request or a file exceeds its byte limit, `415` for unsupported or falsely declared image content, `422` for malformed/unsafe image data or unexpected fields, and `503` when private storage is unavailable. Failures leave the existing collection usable and do not expose a partial batch.

### `PUT /api/body-weight-measurements/{measurement_date}/photos/order`

Accept exactly `{ "photo_ids": [...] }`, containing every current owned photo ID exactly once in the requested order. Reorder atomically and return the ordered collection. Return `409` when the submitted set is stale and `422` for duplicates, omissions, unknown fields, or malformed IDs.

### `GET /api/body-progress-photos/{photo_id}/content`

Authorize ownership, then stream normalized JPEG bytes from S3 with private no-store caching. Return `401`, ownership-safe `404`, or `503` as applicable. Never redirect to or reveal an S3 URL.

### `DELETE /api/body-progress-photos/{photo_id}`

Revoke access, persist required cleanup work, and return `204`. Return `401` or ownership-safe `404` as applicable. Repeated deletion after the first successful request returns `404`.

### Existing F22 endpoints

Each item from `GET /api/body-weight-measurements` adds validated integer `photo_count`. Replacing a same-date measurement preserves photos. `DELETE /api/body-weight-measurements/{measurement_date}` revokes and queues deletion of every associated object in the same database transaction before returning `204`.

## UI Requirements

F22.1 follows `harness/context/07_UI_DESIGN_SYSTEM.md`. It reuses `AppShell`, `AppHeader`, `Page`, `Section`, `Stack`, `Inline`, `Grid`, `Card`, `Button`, `IconButton`, `Field`, `Alert`, `EmptyState`, `LoadingState`, `Dialog`, and `BottomSheet`. Image preview, the responsive thumbnail grid, and viewer composition are feature-specific arrangements built from semantic tokens; they do not introduce a new global visual primitive, raw colors, arbitrary spacing, or an image-analysis convention.

On Body weight, the measurement's date, weight, and note remain primary. Photo count and `Add photos`/`Manage photos` are secondary to F22 edit and delete tasks and do not replace `Save measurement` as the screen's dominant action.

On the photo screen, initial mobile order is header/back, measurement context, concise optional view guidance, stored viewer or empty state, then upload task. When no upload draft exists and capacity remains, `Add photos` is dominant. It opens a shared `BottomSheet` on mobile or `Dialog` on wider layouts containing `Take a photo`, `Choose from device`, and `Cancel`; neither native input is displayed as an unstyled browser control. Once files are selected, `Upload photos` becomes the single dominant action, while `Take another photo`, `Choose more`, removal, reorder, and Cancel remain secondary. Existing stored content remains visible while upload is pending or fails. At five photos, the upload action is unavailable with visible `5 of 5 photos` explanation.

Local previews state `N photos selected` and `N spaces remaining`, include the future combined order after existing photos, and expose file-specific validation errors. After each camera return, focus moves to the new preview/count status rather than reopening the camera automatically. Object URLs are revoked when previews are removed or the screen unmounts. Pending copy uses `Uploading…`, `Saving order…`, or `Deleting…`, prevents duplicates, and preserves context. Upload failure retains the valid draft for retry when safe; a rejected individual file is identified without exposing raw backend payloads. Reorder failure restores the last confirmed order and retains a contained Retry path.

Initial load uses a viewer-shaped loading state rather than false emptiness. The empty state says `No progress photos for this measurement` and retains Add photos. Content failure says `Unable to load this private photo. Please try again.` with contained Retry. A malformed metadata response becomes a recoverable screen error; malformed image bytes remain an unavailable photo state rather than breaking the page. Delete failure leaves the dialog open with feedback and restores focus correctly.

Viewer images use a factual accessible name such as `Body progress photo 2 of 3 for August 14, 2026`; decorative thumbnail duplication is hidden appropriately. Previous/next, thumbnail selection, draft removal, reorder, upload, and delete are fully keyboard and touch operable. Reorder state never relies on color. The layout preserves aspect ratio, does not crop the useful stored image, avoids document-level horizontal scrolling, and supports 200% zoom.

Validate loading, empty, one photo, five photos/capacity, Add photos action sheet, native-picker cancellation, repeated one-at-a-time camera returns, mixed camera/gallery draft, gallery multi-select, over-capacity selection, draft removal/reorder, invalid format, oversized input, unsafe image, batch failure, storage unavailable, upload retry, selection, previous/next, stored reorder success/failure, delete confirmation/failure, measurement cascade deletion, stale/malformed responses, refresh, and Back at 360 px, 390 px, 430 px, representative tablet/small desktop, and wide desktop widths. Verify safe areas, visible focus, 44 px targets, reduced motion, keyboard operation, and no document-level horizontal overflow.

## Business Rules

* Photos are optional sensitive facts associated with exactly one dated body-weight measurement.
* One measurement retains zero to five photos in one explicit display order.
* Recommended front, side, and back views are guidance only and are not labels or validation rules.
* Same-date weight/note replacement retains photos; measurement deletion removes them; profile-only deletion retains them.
* The normalized image is the only retained object. Originals and source metadata are discarded.
* Storage is private, authenticated through FlexGym, and never exposed through public or durable signed URLs.
* Photos have no routine/workout relation and no positive, negative, medical, composition, or goal meaning.

## Validation

Each input file is at most 15 MiB before decoding. A batch contains one to five files and may not bring the stored total above five. Accepted content must decode as JPEG, PNG, WebP, HEIC, or HEIF and must contain a valid primary raster image. Reject zero-sized files, unsupported formats, corrupt/truncated data, images exceeding 40 megapixels, dimensions below 1 pixel, and decompression-bomb conditions. Declared MIME type and extension are hints only.

After normalization, verify JPEG decoding, positive stored dimensions no larger than 2,560 pixels on either edge, and absence of source EXIF/XMP/IPTC metadata. Backend validation remains authoritative.

Because F22.1 adds a migration, validate the complete migration history on a fresh isolated database and an isolated upgrade from the F22 head. Verify constraints, indexes, zero backfill, photo retention on same-date replacement, cascade deletion semantics, and deletion-retry persistence. Exercise a real authenticated API/UI path against a migrated database and compare the configured local `alembic current` and `alembic heads` before completion. Re-running the supported migration command must be safe.

Validate the configured AWS integration separately with the restricted application principal by putting, heading/getting, and deleting a generated non-personal test image beneath a dedicated validation sub-prefix. Confirm SSE-S3, private access, successful deletion, denial outside the application prefix, and no residual validation object. Tests must never upload real personal photos.

## Acceptance Criteria

* [ ] Each owned F22 measurement exposes zero-to-five private photos and a stable ordered management flow.
* [ ] Add photos offers explicit native `Take a photo` and `Choose from device` paths; repeated capture and multi-select both respect stored-plus-draft capacity without silent truncation.
* [ ] Supported mobile image formats are normalized to bounded metadata-free JPEGs; original files are not retained.
* [ ] Browser clients receive neither AWS credentials, provider URLs, bucket names, storage namespaces, nor object keys.
* [ ] S3 keys are grouped by opaque user namespace and immutable measurement date while normal reads remain database-indexed exact-key access rather than bucket scans.
* [ ] Viewing requires an authenticated ownership check and uses private proxy streaming.
* [ ] Upload batches are all-or-nothing from the user's perspective and existing photos remain usable after failure.
* [ ] Photo, measurement, and profile deletion follow their distinct lifecycle rules and failed object cleanup remains durably retryable.
* [ ] The deployed IAM identity can operate only beneath the configured photo prefix and the bucket remains private.
* [ ] No orientation requirement, automatic comparison, body analysis, chart, sharing, AI use, or interpretation is introduced.
* [ ] Fresh/upgrade migration gates, backend/static checks, real migrated flow, AWS smoke validation, and focused manual UI validation pass.

## Tests

Backend tests use an injected deterministic fake object store for ordinary API/service coverage and generated image fixtures for JPEG, PNG, WebP, HEIC/HEIF, orientation, metadata stripping, size/pixel boundaries, corruption, count, ordering, ownership, batch compensation, storage failure, proxy response headers, single deletion, measurement cascade deletion, profile retention, and retry cleanup. ORM metadata-created tables do not satisfy migration validation.

Focused integration tests cover the storage adapter's put/get/delete mapping without embedding credentials. One separately invoked AWS smoke validation uses runtime credentials and generated content, cleans up after itself, and is not part of the hermetic default test suite.

Per DEC-019, F22.1 adds no automated browser coverage. Frontend format, lint, type checks, and existing suitable unit/parser checks cover strict response validation, draft capacity logic, native-input reset, and object-URL cleanup. Focused manual execution covers the specified responsive, accessibility, request, empty, pending, unavailable, error, reorder, viewer, navigation, and confirmation states.

Manual gallery validation runs on desktop and mobile. Native capture validation must additionally run on at least one physical phone against the locally deployed HTTPS application: open and cancel the camera, capture one image, return and capture additional images up to five, mix a captured image with gallery selection, remove a draft image, attempt over-capacity selection, upload through the real migrated API/S3 path, refresh, view, and delete the result. Record the tested device, operating system, and browser. If that browser falls back from `capture` to a file picker, record the fallback and verify that `Choose from device` remains fully usable; do not claim native camera validation passed on that device.

## Out of Scope

* Automatic before/after comparison, side-by-side comparison, overlays, alignment, computer vision, body-fat/composition inference, appearance scores, progress judgements, or medical meaning.
* F23 body-weight charts, ranges, deltas, smoothing, trends, targets, or photo presentation inside charts.
* Required front/side/back labels, pose guidance enforcement, camera overlays, reminders, annotations, captions, editing, filters, cropping controls, or original-file download.
* Public URLs, direct browser-to-S3 upload, FTP, database blobs, local filesystem storage, sharing, export, social features, AI access, or third-party media processing.
* Video, GIF animation, RAW camera formats, AVIF, PDFs, or more than five photos per measurement.
* CDN, background-job infrastructure, storage replication, provider migration UI, or multi-region/high-availability storage.

## Dependencies

F02 Authentication; F03 Fitness Profile; F04 Profile Management; F12 UI system; F20 Progress information architecture; F22 Body Weight Tracking; private S3 bucket and least-privilege runtime credentials.

## Notes

Proxying files through the backend is intentional for this small personal-first collection: it centralizes authorization, count/type/size validation, metadata removal, and provider isolation. The five-photo and normalized-size limits keep that design proportionate without introducing direct-upload coordination or asynchronous media infrastructure.
