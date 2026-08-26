# Codex-Only OpenCode Implementation Runbook

> Audience boundary: this file is for the Codex instance coordinating work with the product owner.
> OpenCode implementation agents must not use this file as project or feature instructions, must
> not launch or manage other OpenCode sessions, and must follow only `AGENTS.md`, `harness/context`,
> and the assigned feature specification for implementation work.

## Purpose

Use this runbook whenever the product owner asks Codex to launch OpenCode to implement a FlexGym
feature. The intent is that a short request such as “launch OpenCode for the next feature” is enough
to reproduce the verified setup without rediscovering the provider, model, reasoning level, Windows
wrapper, or implementation prompt.

This is an execution handoff to a separate OpenCode conversation. It is not a Codex subagent or a
continuation of an existing OpenCode session unless the product owner explicitly requests that.

## Verified Setup

Verified on 2026-08-13:

* OpenCode CLI version: `1.18.16`.
* Provider display name: `OpenCode Go`.
* Provider ID: `opencode-go`.
* Model display name: `DeepSeek V4 Pro (New)`.
* Model ID: `deepseek-v4-pro`.
* Full model selector: `opencode-go/deepseek-v4-pro`.
* Required reasoning variant: `high`.
* Confirmed model variants at verification time: `high` and `max` only.
* Confirmed credentials: OpenCode Go is authenticated.

The product owner may pronounce or transcribe the names imprecisely (for example, “DeepZip”,
“DeepSig”, or “Point Code”). Unless they explicitly request a different setup, the intended values
are the exact IDs above.

Do not select a low-reasoning variant. The product owner originally preferred medium reasoning, but
DeepSeek V4 Pro did not expose a `medium` variant. `high` is therefore the established default and
must be passed explicitly.

## Windows CLI Entry Point

Use the CMD wrapper explicitly:

```powershell
& 'C:\Users\anton\AppData\Roaming\npm\opencode.cmd'
```

Do not invoke bare `opencode` from PowerShell. On this machine it resolves to `opencode.ps1`, which
is blocked by the current PowerShell execution policy because the wrapper is not digitally signed.
The `.cmd` wrapper runs the same installation without changing system policy.

OpenCode reads user configuration and credentials outside the repository sandbox. The execution
may therefore require the normal elevated/sandbox-approval path. Do not change PowerShell execution
policy as a workaround.

## Lightweight Verification

Do not repeat a paid model call before every feature. Normally it is enough to verify the local
registration and credentials when the installation may have changed:

```powershell
& 'C:\Users\anton\AppData\Roaming\npm\opencode.cmd' providers list
& 'C:\Users\anton\AppData\Roaming\npm\opencode.cmd' models opencode-go --verbose
```

Confirm that:

* `OpenCode Go` has credentials.
* `opencode-go/deepseek-v4-pro` is active.
* The `high` variant remains available.

If any of these checks fail, stop and tell the product owner rather than silently selecting another
provider, model, or reasoning level.

## Resolve the Feature

Before launching:

1. Read `AGENTS.md` and the project state.
2. Resolve the feature requested by the product owner. If they say “the next feature”, use the exact
   ready-for-implementation feature named in `harness/context/05_PROJECT_STATE.md`.
3. Confirm that its specification exists under `harness/features` and is marked ready for
   implementation.
4. Do not launch if the requested feature is still under product discussion or its specification is
   incomplete.
5. Note existing worktree changes so the implementation prompt can tell OpenCode to preserve them.

## Start a New Conversation

Start a genuinely new OpenCode conversation by using `opencode run` without `--continue`,
`--session`, or `--fork`.

The conversation and all instructions sent to OpenCode must be in English, even when Codex and the
product owner are speaking Spanish. Code, UI copy, documentation, test names, and OpenCode's final
report must also remain in English under the existing product language contract.

Use:

```powershell
& 'C:\Users\anton\AppData\Roaming\npm\opencode.cmd' run `
  -m opencode-go/deepseek-v4-pro `
  --variant high `
  --title '<FEATURE> Implementation' `
  $implementationPrompt
```

Do not use `--auto` by default. The verified run did not require it, and the CLI describes it as
dangerous. Request additional authority only if a concrete, in-scope implementation action becomes
blocked.

## Standard English Implementation Prompt

Adapt only the feature number, title, specification path, and known unrelated worktree changes:

```text
Start a new implementation task for the FlexGym repository.

Implement <FEATURE NUMBER AND TITLE> completely, as specified in:
<FEATURE SPECIFICATION PATH>

Work autonomously through implementation and validation. Before making changes:
1. Read AGENTS.md completely.
2. Read the source-of-truth project documentation under harness/context, including the complete UI
   design system when the feature affects UI.
3. Read the complete feature specification and all relevant dependency feature specifications.
4. Inspect the existing backend, frontend, tests, routes, and relevant implementation.

Requirements:
- Implement only the scope defined by the feature specification.
- Follow all architectural decisions, harness workflow, design-system rules, API safety rules, and
  DEC-019.
- Preserve unrelated existing worktree changes. Do not overwrite or revert user changes.
- Add meaningful implementation and tests required by the specification.
- Run the relevant tests, backend and frontend quality checks, and all other validation executable
  in this environment.
- Apply the complete migration validation gate if the feature adds or changes a migration.
- Do not merely produce a plan: continue until the feature is implemented and validated as far as
  the environment permits.
- Do not commit the changes.
- Keep all code, UI copy, documentation, test names, and your final implementation report in
  English.
- Update harness/context/05_PROJECT_STATE.md to mark the feature completed only if implementation
  and required validation genuinely satisfy the completion contract. Otherwise leave it in
  progress and report the exact remaining validation or blocker.
- At the end, provide a concise report of changes, validation results, important decisions, and any
  remaining limitations or manual checks.

Use the existing repository as the source of truth; do not rely on any prior conversation.
```

Mention concrete unrelated dirty files in the prompt when useful. Never tell OpenCode that existing
uncommitted changes are disposable.

## Long-Running Execution

Implementation can take a long time. Launch it as a long-running process with a sufficiently large
timeout and retain the execution handle/cell ID supplied by the Codex environment.

After the process has started:

* Tell the product owner that it is running.
* Keep the current Codex turn open until the OpenCode process exits. In the current Windows
  execution environment, unified process handles have proven non-durable across completed Codex
  turns: a process that is healthy before the final response may be reported as `Unknown process
  id` on the next turn and its OpenCode transcript may remain unfinished.
* Poll the retained process with `write_stdin` at intervals of roughly 20-30 seconds while it is
  running. Do not use a blocking wait longer than 60 seconds, and send a concise product-owner
  progress update at least once every 60 seconds.
* Do not send the normal final response merely to say that the implementation is running. Yield a
  final response only after the process exits, or after a concrete blocker requires product-owner
  input. This keeps the PTY and runner alive for the full implementation.
* Do not start a second implementation conversation for the same feature while the first is active.

If an older run was launched under the previous cross-turn assumption and its handle is no longer
available, inspect recent OpenCode sessions with:

```powershell
& 'C:\Users\anton\AppData\Roaming\npm\opencode.cmd' session list --max-count 10 --format json
```

Use `opencode run --session <session-id> ...` only when the product owner asks to continue the same
conversation or when the completed run explicitly needs an in-scope corrective follow-up. Do not
accidentally create a new conversation when continuity is required.

On Windows, pass continuation prompts as one physical command-line string. Multiline PowerShell
arguments routed through `opencode.cmd` have been observed to arrive truncated after their first
line. A one-line English prompt preserves the complete handoff; verify its receipt from the session
transcript if the agent behaves as though requirements are missing.

## Completion Review

OpenCode's final message is not sufficient evidence of completion. When asked to review the result:

1. Read the OpenCode report and inspect the actual worktree diff.
2. Compare the implementation against every acceptance criterion in the feature specification.
3. Preserve unrelated changes and identify which edits belong to OpenCode.
4. Re-run or independently verify checks in proportion to risk.
5. Apply the migration validation gate exactly when applicable.
6. Check whether required manual UI validation remains outstanding.
7. Confirm that `05_PROJECT_STATE.md` does not claim completion prematurely.
8. Report concrete results and remaining work to the product owner in Spanish.

Do not commit, deploy, delete, or revert work unless the product owner separately authorizes it.

## First Verified Handoff

The first verified implementation handoff used this runbook's setup for F20:

* Title: `F20 Progress Exercise History Implementation`.
* Specification: `harness/features/20_progress_exercise_history.md`.
* Provider/model: `opencode-go/deepseek-v4-pro`.
* Variant: `high`.
* Prompt language: English.
* Execution mode: new non-interactive `opencode run` conversation, retained as a long-running
  process for an owner-requested later check.
