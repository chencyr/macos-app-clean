# Repository Guidelines

## Project Overview

**macos-app-clean** is a macOS-focused Node.js CLI tool for **discovering, inspecting, and forcefully removing applications and their associated data**.

Unlike typical “app cleaner” utilities that only target leftover files after an application has already been removed, **macos-app-clean treats the application bundle (`.app`) and its residual artifacts as a single cleanup target**.

The tool is capable of:

* Scanning installed application bundles (`.app`)
* Identifying broken, inconsistent, or partially removed applications
* Discovering associated files scattered across user-level and system-level directories
* **Forcefully removing applications that cannot be cleanly uninstalled via normal means**
* Optionally removing all related artifacts in a controlled, reviewable manner

This tool is intentionally designed for **engineering, remediation, and recovery scenarios**, such as:

* Applications stuck in an undeletable or inconsistent state
* Failed uninstallations leaving behind corrupted bundles or system hooks
* Situations where GUI-based cleaners are insufficient, unreliable, or opaque

Design philosophy:

* **Explicit over implicit**: nothing is removed without being listed first
* **Safety by default**: dry-run and Trash-based deletion are the default behavior
* **Force is intentional**: destructive actions require explicit confirmation
* **Transparency over convenience**: all deletion targets are visible and auditable
* **Recoverability when safe**: move-to-trash deletions are recorded and can be rolled back; undo actions are timestamped and visible via `macos-app-clean --undo-list`

---

## Project Structure & Module Organization

The project is designed around a **single generic CLI entry point**, with internal logic refactorable into modules.

### Expected Structure

```text
/bin
  macos-app-clean        # CLI entry (npm bin / shebang)
/src
  scanner.js             # filesystem traversal (depth-limited)
  normalizer.js          # app / bundle-id normalization
  matcher.js             # grouping & resolution logic
  deleter.js             # app bundle & artifact removal with guardrails
  cli.js                 # argument parsing & output formatting
/index.js                # main program entry
/tests
```

Notes:

* Entry filenames must remain **generic** (`index.js`, `/bin/macos-app-clean`)
* Internal modules must not assume specific filenames
* The CLI interface is the **public contract**; internal structure is flexible

---

## Build, Run & Development Commands

Scan applications and associated artifacts:

```bash
macos-app-clean
```

Filter by keyword:

```bash
macos-app-clean --filter=chrome
```

Inspect removal targets for an application (dry-run):

```bash
macos-app-clean --delete=chrome
```

Execute removal (safe mode: move to Trash):

```bash
macos-app-clean --delete=chrome --force
```

List rollbackable delete operations (move-to-trash only):

```bash
macos-app-clean --undo-list
```

Restore from last delete operation (dry-run by default):

```bash
macos-app-clean --undo-last
macos-app-clean --undo-last --force
```

Restore from a specific delete operation id (dry-run by default):

```bash
macos-app-clean --undo-id=20260227-153012-abc123
macos-app-clean --undo-id=20260227-153012-abc123 --force
```

Permanent removal (dangerous):

```bash
macos-app-clean --delete=chrome --force --rm
```

Include system-level paths:

```bash
macos-app-clean --system
```

Export scan result as JSON (for tooling / debugging):

```bash
macos-app-clean --json > residues.json
```

Reduce noise by requiring a minimum hit count:

```bash
macos-app-clean --minHits=2
```

Development & tests:

```bash
# install dependencies
npm install

# run unit tests (Jest)
npm test

# run CLI from source without global install
npx macos-app-clean --filter=chrome
```

---

## Coding Style & Conventions

* Node.js (CommonJS)
* Prefer synchronous filesystem APIs for deterministic behavior
* Explicit guard conditions over implicit assumptions
* No silent or implicit destructive operations
* Favor small, pure functions for maintainability and testability
* Normalized identifiers must be lowercase
* Filesystem traversal must be depth-limited (`MAX_DEPTH = 2`)
* Permission / locking errors (e.g. EPERM, ENOTEMPTY, EBUSY) should be surfaced with clear, human-readable hints; the tool must not auto-escalate privileges or hide these failures

Refactors must not change CLI flags or default behavior.

---

## Safety Principles (Critical)

The following rules are **non-negotiable**:

* Default execution MUST be dry-run
* Default removal MUST move items to `~/.Trash`
* Permanent deletion requires explicit `--force --rm`
* The tool MUST refuse removal of:

  * `$HOME`
  * `$HOME/Library`
  * `/Library`
  * `/Applications`

Safety rules override all feature expansion.

---

## Testing Guidelines

Target testing strategy:

* Mock filesystem (no real disk mutation)
* Unit-test normalization and matching logic
* Explicitly verify deletion guardrails
* Simulate permission-denied and partial-failure scenarios

Tests must never touch real system directories.

---

## Optimization Roadmap

High-priority improvements:

1. Parse `.app/Contents/Info.plist`
2. Extract `CFBundleIdentifier` and `CFBundleName`
3. Precisely map bundle identifiers to Library artifacts
4. Separate scanner / matcher / deleter into isolated modules
5. Optional interactive mode (selection / confirmation)
6. Cleanup strategies:

   * cache-only
   * full removal
   * keep user data
7. Exportable removal plan (`--export-plan`)

Explicit non-goals:

* No GUI
* No automatic privilege escalation (no sudo)
* No silent or aggressive system-wide cleanup

---

## Agent Instructions

If you are optimizing or refactoring **macos-app-clean**:

* Treat the CLI interface as a stable public API
* Preserve all safety defaults
* Improve identification precision before expanding scope
* Favor maintainability, clarity, and auditability over clever shortcuts

> **Destructive correctness is more important than aggressive cleanup.**
