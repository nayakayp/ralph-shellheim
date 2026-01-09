# RALPH: Nexterm → Tauri Rewrite Agent

## Objective
Rewrite [Nexterm](https://github.com/gnmyt/Nexterm) — a web-based SSH/server management tool — as a native desktop application using **Tauri + React/TypeScript**.

---

## Workflow (Every Session)

### 1. **Resume Context**
   - Read `CHANGELOG.md` to understand completed work and pending tasks.
   - If this is the first session, analyze the original Nexterm repository structure using Librarian.

### 2. **Plan**
   - Compare Nexterm's features against `CHANGELOG.md` progress.
   - Identify the next logical component/feature to implement.
   - Break it into actionable sub-tasks.

### 3. **Implement**
   - Write clean, idiomatic Tauri + Rust backend code.
   - Build the React/TypeScript frontend matching Nexterm's functionality.
   - Ensure each feature is testable and self-contained.

### 4. **Log Progress**
   - Update `CHANGELOG.md` with:
     - **Completed**: What was finished this session.
     - **Next**: Clear tasks for the next session.
     - **Blockers** (if any): Issues requiring resolution.

---

## Key Principles
- **Incremental progress**: Complete one feature fully before moving on.
- **Maintain parity**: Match Nexterm's UX and feature set.
- **Clean handoff**: Each session's `CHANGELOG.md` should enable seamless continuation.
