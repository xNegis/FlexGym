# F06 — Custom Exercises

**Status:** Skipped

## Original Intent

Allow authenticated users to create and manage exercises that are not part of FlexGym's curated
global exercise catalog.

## Decision

F06 is intentionally skipped and will not be implemented as part of the current MVP sequence.

The curated catalog introduced by F05 already covers the common strength-training movements needed
to begin routine planning. Custom exercise creation primarily serves less common equipment,
specialized movement variants, rehabilitation exercises, and personal naming preferences. Those are
valid use cases, but there is not yet evidence that they justify a dedicated user flow in the MVP.

Creating a useful custom exercise would also require the user to provide or the product to infer
structured metadata such as muscle groups, equipment, movement pattern, execution type, and
instructions. Adding that responsibility now would increase UI and domain complexity while producing
potentially incomplete or unreliable exercise data. That data would later affect routine planning,
analytics, substitutions, and adaptive recommendations.

Skipping F06 keeps the next increment focused on validating the core planning flow with curated,
consistent exercise data.

## Reconsideration Criteria

Custom exercises may be reconsidered after routine planning and workout tracking provide evidence
that users repeatedly need movements that cannot reasonably be added to the curated catalog.

Before implementing the capability, the product should decide:

* Which metadata users must provide and which metadata FlexGym may safely infer.
* How custom exercises coexist with similarly named system exercises.
* How exercises referenced by routines or workout history are archived or deleted.
* Whether expanding the curated catalog is sufficient for the observed use cases.

## Result

No application code, API, persistence schema, migration, or UI is introduced for F06.

