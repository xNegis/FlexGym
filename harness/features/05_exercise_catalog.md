# F05 — Exercise Catalog

## Objective

Introduce a useful, system-managed catalog of common strength-training exercises that an
authenticated user can browse, search, filter, and inspect.

The catalog establishes the canonical exercise identities and structured movement metadata that
later routine-planning and workout-tracking features will reference. It deliberately includes a
curated initial dataset so the implementation agent does not need to invent exercise names,
classifications, or content.

## Context

Phase 0 established authenticated users and required fitness profiles. Phase 1 begins representing
training plans, whose routine exercises must eventually refer to stable exercise records.

The roadmap separates the shared exercise catalog from custom exercises. F05 therefore introduces
only global, read-only exercises supplied by FlexGym. User-owned exercise creation belongs to F06.

The current frontend has no general application navigation. F05 may add the smallest authenticated
navigation needed to move between profile management and the exercise catalog, but it must not
introduce a dashboard or final design system.

## User Experience

An authenticated user with a completed fitness profile can open the Exercise catalog from the
authenticated application shell.

The catalog initially shows all exercises ordered alphabetically. The user can:

* Search by exercise name.
* Filter by primary muscle group.
* Filter by equipment.
* Combine search and both filters.
* Clear the active filters.
* Open an exercise to inspect its concise execution guidance and structured metadata.
* Return to the catalog without losing the current search and filters.
* Return to profile management.

The catalog contains useful data immediately after migrations are applied. It must never present a
fresh installation with an empty catalog merely because a separate import or administrator action
was not performed.

## Functional Requirements

### FR-1 — System exercise records

Persist the 74 exercises defined in the Initial Catalog Content section as global system data.
They are not owned by a user and are visible identically to every authenticated user.

Each system exercise has a stable machine identifier (`slug`) that is independent of its database
primary key and display name.

### FR-2 — Catalog availability

The initial catalog must be installed through the normal database migration/bootstrap path in a
deterministic and idempotent manner. A developer must not need to run an undocumented seed command.

The implementation must neither duplicate records when migrations or startup run repeatedly nor
silently rewrite catalog data during ordinary application startup.

### FR-3 — Catalog browsing

The user can retrieve and display the entire initial catalog. Results are ordered by display name
using case-insensitive ascending order, with slug as a deterministic tie-breaker.

F05 does not require pagination because the initial bounded dataset is small. The API contract
should remain easy to extend with pagination later without changing exercise identities.

### FR-4 — Name search

Search performs a case-insensitive substring match against display name after trimming surrounding
query whitespace. An omitted, empty, or whitespace-only query behaves as no search.

Search does not need fuzzy matching, stemming, aliases, typo correction, or matching against
instructions and metadata.

### FR-5 — Structured filters

The user can filter by exactly one primary muscle group and exactly one equipment value at a time.
Both filters may be combined with each other and with name search. Every active condition must match
for an exercise to be returned.

Secondary muscles do not affect the primary-muscle filter.

### FR-6 — Exercise detail

The user can inspect one exercise using its stable slug. Detail shows every public field, with enum
values translated into friendly labels and a concise execution summary.

An unknown slug returns an explicit not-found response and a safe UI state from which the user can
return to the catalog.

### FR-7 — Read-only boundary

F05 exposes no API or UI for creating, updating, archiving, or deleting system exercises. Catalog
records cannot be mutated through user-facing requests.

### FR-8 — Authentication and onboarding boundary

Catalog endpoints require authenticated identity. The frontend exposes the catalog only after the
user has completed fitness-profile onboarding. The API does not require a profile because profile
completion is an application navigation concern rather than exercise ownership.

### FR-9 — Frontend request handling

The catalog has explicit loading, loaded, no-results, detail, not-found, and failure states.
Changing a filter or search term must not leave stale errors visible.

Frontend API functions treat response bodies as untrusted runtime values. Malformed success and
error payloads are normalized before reaching React components; raw server values are never
rendered.

### FR-10 — Architectural boundaries

HTTP endpoints remain thin. Catalog querying and exercise lookup live in an application service or
equivalent non-HTTP boundary. React components use the frontend API layer rather than calling URLs
directly.

## Domain / Data Requirements

F05 introduces `Exercise` with:

* Application-generated primary key.
* Stable, unique, lowercase kebab-case slug.
* Unique display name.
* Primary muscle group.
* Zero or more secondary muscle groups.
* Primary equipment category.
* Movement pattern.
* Execution type.
* Concise execution instructions.

The model must support multiple secondary muscles without storing a comma-separated display string.
The specific relational representation is an implementation choice, but filtering and future code
must consume structured values rather than parse prose.

System exercises have no `user_id`. F06 may extend the exercise model or introduce a compatible
user-owned representation, but F05 must not add nullable ownership fields without an actual custom
exercise use case.

### Muscle-group vocabulary

The exact persisted values are:

* `chest`
* `lats`
* `upper_back`
* `shoulders`
* `biceps`
* `triceps`
* `forearms`
* `quadriceps`
* `hamstrings`
* `glutes`
* `adductors`
* `calves`
* `core`
* `full_body`

`full_body` is reserved for movements whose training purpose is genuinely distributed across the
body. It must not be used merely because a compound exercise has several secondary muscles.

### Equipment vocabulary

The exact persisted values are:

* `bodyweight`
* `barbell`
* `dumbbell`
* `kettlebell`
* `cable`
* `machine`
* `resistance_band`
* `pull_up_bar`

Equipment describes the primary resistance or apparatus used for catalog filtering. Ordinary
supporting items such as a bench are not separately modelled in F05. `bodyweight` means no external
resistance is essential; a floor, wall, or ordinary stable support is not treated as equipment.

### Movement-pattern vocabulary

The exact persisted values are:

* `horizontal_push`
* `vertical_push`
* `horizontal_pull`
* `vertical_pull`
* `horizontal_adduction`
* `shoulder_abduction`
* `elbow_flexion`
* `elbow_extension`
* `squat`
* `lunge`
* `hinge`
* `hip_thrust`
* `knee_extension`
* `knee_flexion`
* `hip_abduction`
* `hip_adduction`
* `calf_raise`
* `trunk_flexion`
* `trunk_anti_extension`
* `trunk_anti_rotation`
* `trunk_lateral_stability`
* `carry`

This field describes the exercise's principal training pattern, not every joint action occurring
during execution.

### Friendly labels

The frontend uses these exact English labels rather than displaying raw persisted values:

| Persisted value | Friendly label |
|---|---|
| `chest` | Chest |
| `lats` | Lats |
| `upper_back` | Upper back |
| `shoulders` | Shoulders |
| `biceps` | Biceps |
| `triceps` | Triceps |
| `forearms` | Forearms |
| `quadriceps` | Quadriceps |
| `hamstrings` | Hamstrings |
| `glutes` | Glutes |
| `adductors` | Adductors |
| `calves` | Calves |
| `core` | Core |
| `full_body` | Full body |
| `bodyweight` | Bodyweight |
| `barbell` | Barbell |
| `dumbbell` | Dumbbell |
| `kettlebell` | Kettlebell |
| `cable` | Cable |
| `machine` | Machine |
| `resistance_band` | Resistance band |
| `pull_up_bar` | Pull-up bar |
| `horizontal_push` | Horizontal push |
| `vertical_push` | Vertical push |
| `horizontal_pull` | Horizontal pull |
| `vertical_pull` | Vertical pull |
| `horizontal_adduction` | Horizontal adduction |
| `shoulder_abduction` | Shoulder abduction |
| `elbow_flexion` | Elbow flexion |
| `elbow_extension` | Elbow extension |
| `squat` | Squat |
| `lunge` | Lunge |
| `hinge` | Hip hinge |
| `hip_thrust` | Hip thrust |
| `knee_extension` | Knee extension |
| `knee_flexion` | Knee flexion |
| `hip_abduction` | Hip abduction |
| `hip_adduction` | Hip adduction |
| `calf_raise` | Calf raise |
| `trunk_flexion` | Trunk flexion |
| `trunk_anti_extension` | Anti-extension |
| `trunk_anti_rotation` | Anti-rotation |
| `trunk_lateral_stability` | Lateral stability |
| `carry` | Loaded carry |
| `bilateral` | Bilateral |
| `unilateral` | Unilateral |
| `alternating` | Alternating |
| `isometric` | Isometric hold |

### Execution-type vocabulary

The exact persisted values are:

* `bilateral` — both sides act together as one repetition.
* `unilateral` — one side performs its repetitions separately.
* `alternating` — sides alternate within the set.
* `isometric` — the principal task is holding a position rather than repeating a movement.

This metadata is descriptive in F05. Set counting and per-side workout behaviour belong to Phase 2.

### Instruction-content rules

Instructions are deliberately concise catalog guidance, not medical or individualized coaching.
Each entry must:

* Use one or two short sentences.
* Describe the starting position and principal action.
* Include at most one generally useful control or range-of-motion cue.
* Avoid claims that an exercise is safe, mandatory, superior, corrective, or suitable for an injury.
* Avoid prescribed loads, repetitions, tempo, breathing, or programming.
* Avoid anatomical detail that is not needed to recognize and perform the movement.

The exact initial instruction text is listed below. Minor punctuation changes are acceptable;
changing its meaning or adding unsupported coaching claims is not.

## Initial Catalog Content

The following 74 records are the complete F05 seed dataset. Listed secondary muscles are
stored as structured values; `—` means an empty secondary-muscle collection.

### Chest

| Slug | Display name | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|
| `barbell-bench-press` | Barbell Bench Press | triceps, shoulders | barbell | horizontal_push | bilateral | Lie on a flat bench with the bar over the chest. Lower it under control, then press until the arms are extended. |
| `incline-barbell-bench-press` | Incline Barbell Bench Press | shoulders, triceps | barbell | horizontal_push | bilateral | Lie on an inclined bench with the bar above the upper chest. Lower it under control and press back up. |
| `dumbbell-bench-press` | Dumbbell Bench Press | triceps, shoulders | dumbbell | horizontal_push | bilateral | Lie on a flat bench with a dumbbell beside each side of the chest. Press them upward and lower them under control. |
| `incline-dumbbell-bench-press` | Incline Dumbbell Bench Press | shoulders, triceps | dumbbell | horizontal_push | bilateral | Lie on an inclined bench holding the dumbbells near the upper chest. Press upward and return under control. |
| `machine-chest-press` | Machine Chest Press | triceps, shoulders | machine | horizontal_push | bilateral | Adjust the seat so the handles align near the chest. Press forward, then return without letting the weight stack slam. |
| `cable-chest-fly` | Cable Chest Fly | shoulders | cable | horizontal_adduction | bilateral | Stand between the cables with the arms open and slightly bent. Bring the hands together in front of the chest, then reopen under control. |
| `push-up` | Push-Up | triceps, shoulders, core | bodyweight | horizontal_push | bilateral | Start in a straight-body plank with hands below or slightly outside the shoulders. Lower the chest toward the floor and push back up. |
| `parallel-bar-dip` | Parallel Bar Dip | triceps, shoulders | bodyweight | vertical_push | bilateral | Support the body on parallel bars and lower by bending the elbows. Press back to the supported position within a controlled range. |

All exercises in this subsection have primary muscle `chest`.

### Back

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `pull-up` | Pull-Up | lats | biceps, upper_back, core | pull_up_bar | vertical_pull | bilateral | Hang from a bar with an overhand grip. Pull until the upper chest approaches the bar, then lower under control. |
| `chin-up` | Chin-Up | lats | biceps, upper_back, core | pull_up_bar | vertical_pull | bilateral | Hang from a bar with an underhand grip. Pull the body upward, then return to a controlled hang. |
| `assisted-pull-up` | Assisted Pull-Up | lats | biceps, upper_back | machine | vertical_pull | bilateral | Set the assistance and begin from a supported hang. Pull upward and lower under control while keeping the torso stable. |
| `lat-pulldown` | Lat Pulldown | lats | biceps, upper_back | cable | vertical_pull | bilateral | Sit with the thighs secured and grip the bar overhead. Pull it toward the upper chest, then let the arms extend under control. |
| `straight-arm-cable-pulldown` | Straight-Arm Cable Pulldown | lats | core | cable | vertical_pull | Stand facing a high cable with arms nearly straight. Draw the handle down toward the thighs, then return without turning it into an elbow pull. |
| `barbell-bent-over-row` | Barbell Bent-Over Row | upper_back | lats, biceps, hamstrings, core | barbell | horizontal_pull | Hinge forward holding the bar below the shoulders. Row it toward the torso and lower it while maintaining the hinged position. |
| `one-arm-dumbbell-row` | One-Arm Dumbbell Row | lats | upper_back, biceps | dumbbell | horizontal_pull | Support the torso and hold a dumbbell with one arm extended. Row it toward the hip, then lower under control. |
| `seated-cable-row` | Seated Cable Row | upper_back | lats, biceps | cable | horizontal_pull | Sit tall with the cable in front and arms extended. Pull the handle toward the torso and return without rocking. |
| `chest-supported-machine-row` | Chest-Supported Machine Row | upper_back | lats, biceps | machine | horizontal_pull | Set the chest against the pad and begin with arms extended. Pull the handles back, then return under control. |
| `inverted-row` | Inverted Row | upper_back | lats, biceps, core | bodyweight | horizontal_pull | Hang beneath a secure horizontal bar with the body straight. Pull the chest toward the bar and lower as one controlled unit. |
| `resistance-band-row` | Resistance Band Row | upper_back | lats, biceps | resistance_band | horizontal_pull | Anchor the band in front and begin with arms extended. Pull the hands toward the torso, then return with steady tension. |

### Shoulders

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `barbell-overhead-press` | Barbell Overhead Press | shoulders | triceps, core | barbell | vertical_push | bilateral | Hold the bar near the upper chest while standing. Press it overhead and lower it back under control. |
| `dumbbell-shoulder-press` | Dumbbell Shoulder Press | shoulders | triceps | dumbbell | vertical_push | Hold the dumbbells beside the shoulders while seated or standing. Press overhead and lower under control. |
| `machine-shoulder-press` | Machine Shoulder Press | shoulders | triceps | machine | vertical_push | Adjust the seat so the handles begin near shoulder height. Press upward and return under control. |
| `dumbbell-lateral-raise` | Dumbbell Lateral Raise | shoulders | — | dumbbell | shoulder_abduction | bilateral | Stand with dumbbells by the sides and elbows slightly bent. Raise the arms out to the sides, then lower under control. |
| `cable-lateral-raise` | Cable Lateral Raise | shoulders | — | cable | shoulder_abduction | unilateral | Stand beside a low cable and hold it with the outside hand. Raise the arm to the side, then return under control. |
| `resistance-band-lateral-raise` | Resistance Band Lateral Raise | shoulders | — | resistance_band | shoulder_abduction | bilateral | Stand on the band with the hands by the sides. Raise the arms outward against the band and lower steadily. |
| `reverse-pec-deck` | Reverse Pec Deck | shoulders | upper_back | machine | horizontal_pull | Sit facing the pad with the arms in front. Open the arms outward, then return the handles under control. |
| `dumbbell-rear-delt-fly` | Dumbbell Rear Delt Fly | shoulders | upper_back | dumbbell | horizontal_pull | Hinge forward with the dumbbells below the shoulders. Open the arms outward with soft elbows, then lower under control. |
| `face-pull` | Face Pull | shoulders | upper_back | cable | horizontal_pull | Set a rope near face height and begin with arms extended. Pull toward the face while separating the rope ends, then return slowly. |

### Arms

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `barbell-curl` | Barbell Curl | biceps | forearms | barbell | elbow_flexion | bilateral | Stand with the bar at arm's length. Bend the elbows to raise it toward the shoulders, then lower without swinging the torso. |
| `dumbbell-curl` | Dumbbell Curl | biceps | forearms | dumbbell | elbow_flexion | bilateral | Hold the dumbbells by the sides with arms extended. Curl them toward the shoulders and lower under control. |
| `hammer-curl` | Hammer Curl | biceps | forearms | dumbbell | elbow_flexion | bilateral | Hold the dumbbells with palms facing inward. Bend the elbows to raise them, then lower while keeping the neutral grip. |
| `cable-curl` | Cable Curl | biceps | forearms | cable | elbow_flexion | bilateral | Stand facing a low cable with arms extended. Curl the handle toward the shoulders and return with controlled tension. |
| `resistance-band-curl` | Resistance Band Curl | biceps | forearms | resistance_band | elbow_flexion | bilateral | Stand on the band with arms extended. Curl the hands toward the shoulders, then lower steadily. |
| `cable-triceps-pushdown` | Cable Triceps Pushdown | triceps | — | cable | elbow_extension | bilateral | Stand facing a high cable with elbows near the sides. Extend the elbows to move the handle down, then return under control. |
| `overhead-cable-triceps-extension` | Overhead Cable Triceps Extension | triceps | — | cable | elbow_extension | bilateral | Face away from a cable with the handle behind the head. Extend the elbows overhead, then return without changing the upper-arm position excessively. |
| `dumbbell-overhead-triceps-extension` | Dumbbell Overhead Triceps Extension | triceps | — | dumbbell | elbow_extension | bilateral | Hold one dumbbell overhead with both hands. Bend the elbows to lower it behind the head, then extend the arms. |
| `close-grip-bench-press` | Close-Grip Bench Press | triceps | chest, shoulders | barbell | horizontal_push | bilateral | Lie on a flat bench holding the bar with a moderately close grip. Lower it toward the chest and press up while keeping the elbows controlled. |
| `resistance-band-triceps-extension` | Resistance Band Triceps Extension | triceps | — | resistance_band | elbow_extension | bilateral | Anchor the band above or behind the body with elbows bent. Extend the elbows against the band and return steadily. |

### Quadriceps and lunge patterns

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `barbell-back-squat` | Barbell Back Squat | quadriceps | glutes, hamstrings, core | barbell | squat | bilateral | Support the bar across the upper back and stand with a stable stance. Squat down under control, then stand back up. |
| `barbell-front-squat` | Barbell Front Squat | quadriceps | glutes, core | barbell | squat | bilateral | Support the bar across the front of the shoulders. Squat while keeping the torso controlled, then stand back up. |
| `goblet-squat` | Goblet Squat | quadriceps | glutes, core | dumbbell | squat | bilateral | Hold a dumbbell close to the chest. Squat between the hips, then push through the feet to stand. |
| `bodyweight-squat` | Bodyweight Squat | quadriceps | glutes, core | bodyweight | squat | bilateral | Stand with a comfortable stance and arms free for balance. Sit down into a squat, then stand while keeping the feet planted. |
| `leg-press` | Leg Press | quadriceps | glutes, hamstrings | machine | squat | bilateral | Place the feet securely on the platform and release the safeties. Bend the knees to lower the platform, then press it away without locking out forcefully. |
| `hack-squat` | Hack Squat | quadriceps | glutes, hamstrings | machine | squat | bilateral | Set the shoulders and back against the machine pads. Lower by bending the knees and hips, then press back to standing. |
| `bulgarian-split-squat` | Bulgarian Split Squat | quadriceps | glutes, hamstrings, core | dumbbell | lunge | unilateral | Place the rear foot on a bench and keep the front foot stable. Lower through the front leg, then stand back up before changing sides. |
| `reverse-lunge` | Reverse Lunge | quadriceps | glutes, hamstrings, core | bodyweight | lunge | alternating | Step one foot backward and lower both knees under control. Push through the front foot to return and alternate sides. |
| `walking-lunge` | Walking Lunge | quadriceps | glutes, hamstrings, core | dumbbell | lunge | alternating | Step forward into a lunge while holding the dumbbells by the sides. Rise and continue into the next step with the other leg. |
| `leg-extension` | Leg Extension | quadriceps | — | machine | knee_extension | bilateral | Adjust the machine so the knee aligns with its pivot. Extend the knees to raise the pad, then lower under control. |

### Hamstrings, glutes, and hips

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `conventional-deadlift` | Conventional Deadlift | glutes | hamstrings, quadriceps, upper_back, forearms, core | barbell | hinge | bilateral | Stand with the bar over the midfoot and grip it from a hinged position. Push the floor away to stand with the bar, then return it under control. |
| `barbell-romanian-deadlift` | Barbell Romanian Deadlift | hamstrings | glutes, upper_back, forearms, core | barbell | hinge | bilateral | Hold the bar in front of the thighs with soft knees. Hinge the hips back until the hamstrings are loaded, then stand tall. |
| `dumbbell-romanian-deadlift` | Dumbbell Romanian Deadlift | hamstrings | glutes, forearms, core | dumbbell | hinge | bilateral | Hold the dumbbells in front of the thighs with soft knees. Hinge the hips back, then drive the hips forward to stand. |
| `seated-leg-curl` | Seated Leg Curl | hamstrings | — | machine | knee_flexion | bilateral | Adjust the machine so the knee aligns with its pivot and secure the pads. Bend the knees to pull the pad down, then return slowly. |
| `lying-leg-curl` | Lying Leg Curl | hamstrings | — | machine | knee_flexion | bilateral | Lie on the machine with the pad above the heels. Bend the knees to curl the pad upward, then lower under control. |
| `barbell-hip-thrust` | Barbell Hip Thrust | glutes | hamstrings, core | barbell | hip_thrust | bilateral | Place the upper back against a bench with the bar across the hips. Drive the hips upward, then lower under control. |
| `glute-bridge` | Glute Bridge | glutes | hamstrings, core | bodyweight | hip_thrust | bilateral | Lie on the back with knees bent and feet planted. Lift the hips until the torso and thighs align, then lower steadily. |
| `single-leg-glute-bridge` | Single-Leg Glute Bridge | glutes | hamstrings, core | bodyweight | hip_thrust | unilateral | Lie on the back with one foot planted and the other leg raised. Lift the hips using the planted leg, then lower before changing sides. |
| `cable-pull-through` | Cable Pull-Through | glutes | hamstrings, core | cable | hinge | bilateral | Face away from a low cable with the handle between the legs. Hinge back, then extend the hips to stand without pulling with the arms. |
| `back-extension` | Back Extension | glutes | hamstrings, upper_back | machine | hinge | bilateral | Set the pad below the hips and begin with the torso aligned. Hinge forward under control, then extend the hips to return to alignment. |
| `machine-hip-abduction` | Machine Hip Abduction | glutes | — | machine | hip_abduction | bilateral | Sit with the outer legs against the pads. Move the knees apart, then return under control. |
| `cable-hip-abduction` | Cable Hip Abduction | glutes | core | cable | hip_abduction | unilateral | Attach a low cable to one ankle and stand side-on with support. Move the working leg outward, then return before changing sides. |
| `machine-hip-adduction` | Machine Hip Adduction | adductors | — | machine | hip_adduction | bilateral | Sit with the inner legs against the pads. Bring the knees together, then return under control. |

### Calves

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `standing-calf-raise` | Standing Calf Raise | calves | — | machine | calf_raise | bilateral | Stand with the balls of the feet supported and heels free to move. Raise the heels, then lower through a controlled range. |
| `seated-calf-raise` | Seated Calf Raise | calves | — | machine | calf_raise | bilateral | Sit with the knees secured beneath the pad and the balls of the feet supported. Raise the heels, then lower under control. |
| `single-leg-bodyweight-calf-raise` | Single-Leg Bodyweight Calf Raise | calves | core | bodyweight | calf_raise | unilateral | Stand on one foot while using light support for balance. Raise the heel, then lower under control before changing sides. |

### Core

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `plank` | Plank | core | shoulders | bodyweight | trunk_anti_extension | isometric | Support the body on the forearms and toes in a straight line. Hold the trunk steady without letting the hips sag or rise. |
| `side-plank` | Side Plank | core | shoulders, glutes | bodyweight | trunk_lateral_stability | isometric | Support the body on one forearm and the side of one foot. Hold a straight side-on position before changing sides. |
| `dead-bug` | Dead Bug | core | — | bodyweight | trunk_anti_extension | alternating | Lie on the back with hips and knees bent and arms raised. Extend the opposite arm and leg while keeping the trunk steady, then alternate. |
| `bird-dog` | Bird Dog | core | glutes, shoulders | bodyweight | trunk_anti_rotation | alternating | Begin on hands and knees. Extend the opposite arm and leg without rotating the torso, then alternate sides. |
| `cable-crunch` | Cable Crunch | core | — | cable | trunk_flexion | bilateral | Kneel facing a high cable with the handle near the head. Flex the trunk to bring the ribs toward the pelvis, then return under control. |
| `hanging-knee-raise` | Hanging Knee Raise | core | forearms | pull_up_bar | trunk_flexion | bilateral | Hang from a bar with the body steady. Raise the knees toward the torso, then lower without excessive swinging. |
| `pallof-press` | Pallof Press | core | shoulders | cable | trunk_anti_rotation | unilateral | Stand side-on to a cable and hold the handle at the chest. Press the hands forward without letting the torso rotate, then change sides. |
| `ab-wheel-rollout` | Ab Wheel Rollout | core | shoulders, lats | bodyweight | trunk_anti_extension | bilateral | Kneel holding the wheel beneath the shoulders. Roll forward while keeping the trunk controlled, then pull back to the start. |

The ab wheel is treated as `bodyweight` in the initial filtering vocabulary because body weight is
the resistance and F05 avoids a single-use equipment category. The display name and instructions
still make the small accessory requirement explicit.

### Full body and loaded carries

| Slug | Display name | Primary | Secondary muscles | Equipment | Pattern | Execution | Concise instructions |
|---|---|---|---|---|---|---|---|
| `farmers-carry` | Farmer's Carry | full_body | forearms, upper_back, core, glutes | dumbbell | carry | bilateral | Stand tall holding a dumbbell in each hand. Walk with controlled steps while keeping the weights steady at the sides. |
| `kettlebell-swing` | Kettlebell Swing | full_body | glutes, hamstrings, core, shoulders, forearms | kettlebell | hinge | bilateral | Hinge to guide the kettlebell between the legs. Drive the hips forward so it swings upward, then let it return into the next hinge. |

### Coverage rationale

The dataset is intentionally broad rather than exhaustive:

* It covers every defined primary muscle group except `forearms`, which is represented repeatedly as
  a secondary muscle without adding low-priority isolation exercises to the first catalog.
* It provides barbell, dumbbell, cable, machine, resistance-band, pull-up-bar, kettlebell, and
  bodyweight options.
* It supports all four existing training environments: full gym, home gym, minimal equipment, and
  bodyweight only.
* Major movement families have both compound and isolation choices where that distinction is useful.
* Common variations are separate only when they materially change equipment, setup, movement, or
  routine selection. Cosmetic grip and stance variants are not separate exercises.
* It is large enough to build realistic routines in later features but small enough to review and
  maintain as an explicitly curated seed dataset.

## API Requirements

### `GET /api/exercises`

Requires authentication.

Optional query parameters:

* `search`: exercise-name substring.
* `primary_muscle`: one value from the muscle-group vocabulary.
* `equipment`: one value from the equipment vocabulary.

Responses:

* `200` with a JSON array of exercise summaries, including an empty array when no exercises match.
* `401` when unauthenticated.
* `422` when a supplied structured filter is not a supported value or a parameter is repeated in a
  form the API does not support.

Search longer than 100 characters returns `422`. Unknown query parameters are rejected rather than
silently ignored.

Each summary has this exact shape:

```json
{
  "slug": "barbell-bench-press",
  "name": "Barbell Bench Press",
  "primary_muscle": "chest",
  "secondary_muscles": ["triceps", "shoulders"],
  "equipment": "barbell",
  "movement_pattern": "horizontal_push",
  "execution_type": "bilateral"
}
```

### `GET /api/exercises/{slug}`

Requires authentication.

Responses:

* `200` with the complete exercise.
* `404 {"detail":"Exercise not found"}` for an unknown slug.
* `401` when unauthenticated.

The complete representation adds instructions to the summary shape:

```json
{
  "slug": "barbell-bench-press",
  "name": "Barbell Bench Press",
  "primary_muscle": "chest",
  "secondary_muscles": ["triceps", "shoulders"],
  "equipment": "barbell",
  "movement_pattern": "horizontal_push",
  "execution_type": "bilateral",
  "instructions": "Lie on a flat bench with the bar over the chest. Lower it under control, then press until the arms are extended."
}
```

Database IDs, timestamps, ownership placeholders, and internal relationship records are not public.

### Error normalization

Frontend API functions must explicitly handle string-detail errors, FastAPI array-shaped `422`
details, malformed JSON, and unexpected successful payloads. Components receive a stable string
message or a typed not-found outcome, never an arbitrary response body.

## UI Requirements

### Minimal authenticated navigation

After onboarding, the user can move between:

* Profile.
* Exercises.

The navigation identifies the current section and works without horizontal overflow at common
mobile widths. Logout remains available from profile management; duplicating it on every catalog
screen is not required.

### Catalog list

The list screen includes:

* Heading `Exercise catalog`.
* Search input labelled `Search exercises`.
* Primary-muscle select with `All muscle groups` plus every supported friendly label.
* Equipment select with `All equipment` plus every supported friendly label.
* Clear-filters action when any search or filter is active.
* Result count using correct singular/plural wording.
* One compact item per exercise showing name, primary muscle, and equipment.
* A clear action or clickable affordance to open detail.

Filtering may request the API after each input change or operate over a previously loaded complete
catalog. Whichever approach is selected must preserve the API filtering contract and avoid race
conditions in which an older response replaces newer criteria.

### Catalog states

* Initial loading shows a non-empty status without displaying a false zero-result state.
* No matches shows `No exercises match your search and filters.` and exposes Clear filters.
* A list-request failure shows a normalized message and Retry action while preserving criteria.
* An authentication failure returns the application to login using the existing session handling.
* Malformed list data is treated as a request failure, not partially rendered.

### Exercise detail

Detail displays:

* Exercise name.
* Friendly primary muscle.
* Friendly secondary muscles, or `None` when empty.
* Friendly equipment.
* Friendly movement pattern.
* Friendly execution type.
* Concise instructions.
* Back-to-catalog action.

An unknown exercise shows `Exercise not found` with a back-to-catalog action. A network, protocol,
or malformed-response failure shows a normalized message and permits retry or return.

The UI does not display slugs, database IDs, raw enum values, or raw `null` values as content.

## Business Rules

* System exercises are global and read-only.
* Exercise slugs are stable identities and must not be derived dynamically from mutable display
  names at response time.
* Display names and slugs are unique.
* Every primary and secondary muscle uses the same vocabulary.
* A primary muscle must not also appear in the same exercise's secondary-muscle collection.
* Secondary-muscle order follows the order specified in the initial dataset and is stable in API
  responses.
* Duplicate secondary muscles are invalid.
* Search and filters never alter persisted data.
* A no-results query is successful and returns an empty list.
* Catalog content is factual application data, not a derived signal or AI interpretation.
* The catalog does not infer suitability from a user's profile, goal, experience, equipment, or
  physical limitations.

## Validation

* Slugs contain only lowercase ASCII letters, digits, and single hyphens; they do not begin or end
  with a hyphen and are at most 100 characters.
* Display names are trimmed, non-empty, and at most 120 characters.
* Instructions are trimmed, non-empty, and at most 500 characters.
* Enum fields accept only the exact documented persisted values.
* Search is trimmed and at most 100 characters.
* Structured filters reject unsupported values with `422`.
* Unknown query parameters are rejected with `422`.
* Seed-data validation uses the same domain constraints as runtime reads or an equivalent explicit
  validation step, so malformed catalog records fail during development rather than leaking to the
  frontend.

## Acceptance Criteria

* [x] Applying migrations to a new database installs exactly the 74 specified system exercises.
* [x] Re-running the supported setup path does not duplicate catalog records.
* [x] Every seeded exercise matches its specified slug, name, primary muscle, ordered secondary
  muscles, equipment, movement pattern, execution type, and instruction meaning.
* [x] An authenticated user can browse all exercises in deterministic alphabetical order.
* [x] Search is trimmed, case-insensitive, and matches name substrings.
* [x] Primary-muscle and equipment filters work independently and together with search.
* [x] A valid query with no matches returns `200 []` and produces a useful no-results UI.
* [x] Invalid filters and overlong search return `422` without exposing internal details.
* [x] An authenticated user can inspect every public field for an exercise by slug.
* [x] An unknown slug returns the documented `404` and leaves the UI usable.
* [x] Catalog endpoints return `401` when unauthenticated.
* [x] No user-facing endpoint can create, update, or delete system exercises.
* [x] Profile and Exercises navigation works after onboarding and identifies the active section.
* [x] Returning from detail preserves the catalog search and filters during the current frontend
  session.
* [x] Loading, no-results, list failure, detail failure, and not-found states are distinct and
  recoverable.
* [x] Unexpected or malformed API bodies are never rendered directly.
* [x] Registration, login, authentication restoration, profile onboarding, profile management,
  profile deletion, logout, health, CORS, and backend-unavailable flows retain their documented
  behaviour.
* [x] Catalog and detail screens work at a common mobile viewport without horizontal overflow.
* [x] Backend formatting, linting, type checking, migrations, and tests pass.
* [x] Frontend formatting, linting, and type checking pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Add backend tests covering:

* A migrated isolated database contains exactly 74 unique catalog exercises and representative
  records from chest, back, shoulders, arms, legs, core, and full-body sections match the specified
  metadata.
* Authenticated listing is alphabetically ordered and returns the public summary shape without
  database IDs.
* One combined query demonstrates case-insensitive trimmed search plus muscle and equipment filter
  intersection, and a second query returns an empty list.
* One representative invalid filter returns `422`.
* Detail lookup returns the specified complete record, while an unknown slug returns the documented
  `404`.
* One combined unauthenticated test covers list and detail.

Do not add one automated test per seeded exercise, enum value, or filter combination. Dataset
completeness should be checked by a deterministic seed count, uniqueness constraints, validation,
and selected representative records.

No frontend unit, component, browser, Playwright, or end-to-end tests are required for F05. Because
they are deferred, focused manual execution or code inspection must verify:

* Authenticated navigation between Profile and Exercises.
* Search, each filter, combined filtering, clearing, and no-results behaviour.
* Search/filter preservation when returning from exercise detail.
* One list failure and one detail/not-found failure leaving the UI recoverable.
* Friendly metadata labels and absence of raw enum values.
* Safe behaviour for malformed list, detail, and error payloads.
* Mobile-width layout without horizontal overflow.

Existing automated tests must continue to pass, and all backend and frontend quality checks remain
required.

## Out of Scope

* Custom or user-owned exercises.
* Administrator catalog management, bulk imports, external exercise APIs, or content synchronization.
* Exercise aliases, localization, images, video, animation, rich text, or external links.
* Fuzzy search, relevance ranking, autocomplete, pagination, saved filters, and favorites.
* Filtering or recommending exercises from the user's profile, training environment, goals,
  experience, or limitations.
* Exercise substitutions, contraindications, injury screening, or medical advice.
* Routine creation, routine exercises, sets, repetitions, loads, rest targets, progression, or
  scheduling.
* Workout execution, history, feedback, discomfort, signals, adaptations, or AI reasoning.
* Final dashboard, final application navigation, and a comprehensive design system.
* Frontend automated or end-to-end testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.

## Notes

Prefer a data migration or another explicit migration-integrated seed mechanism so schema and
required reference data reach a consistent version together. Do not insert or reconcile all catalog
rows on every application startup.

The taxonomy is intentionally pragmatic. It is structured enough for routine browsing and future
planning without pretending to encode biomechanics, clinical suitability, or a complete anatomical
ontology.

Keep display-label maps at the API/UI boundary and persist stable machine values. Do not duplicate
the initial exercise dataset independently in backend production code, backend tests, and frontend
code; establish one authoritative persisted seed source and assert selected records from tests.
