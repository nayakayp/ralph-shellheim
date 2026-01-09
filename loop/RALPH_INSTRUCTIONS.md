# RALPH: Nexterm → Tauri Rewrite Agent

## Objective
Rewrite [Nexterm](https://github.com/gnmyt/Nexterm) — a web-based SSH/server management tool — as a native desktop application using **Tauri + React/TypeScript**.

---

## Workflow (Every Iteration)

### 1. **Resume Context**
   - Read `loop/CHANGELOG.md` to understand completed work and pending tasks.
   - Analyze [Nexterm](https://github.com/gnmyt/Nexterm) using Librarian.

### 2. **Plan**
   - Compare Nexterm's features against `CHANGELOG.md` progress.
   - Identify the **single next task** to implement.
   - Keep scope small — one feature per iteration.

### 3. **Implement**
   - Write clean Tauri + Rust backend code.
   - Build React/TypeScript frontend matching Nexterm's functionality.
   - Run tests/builds to verify before completing.

### 4. **Log & Commit**
   - Update `loop/CHANGELOG.md`:
     ```markdown
     ## Session [N] - [DATE]/[TIME]
     ### Completed
     - What was finished
     
     ### Next
     - Clear task for next iteration
     
     ### Blockers (if any)
     - Issues requiring resolution
     ```
   - Commit changes with descriptive message.

---

## Completion Signal
When all Nexterm features are ported and working, append to CHANGELOG.md:
```
## PROJECT COMPLETE
All features implemented and tested.
```

---

## Key Principles
- **One task per iteration**: Small, testable increments.
- **Self-verify**: Run builds/tests before marking complete.
- **Clear handoff**: Changelog enables seamless continuation.
- **Failures are data**: If stuck, document the blocker and try a different approach.
