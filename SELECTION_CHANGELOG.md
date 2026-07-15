# RiseForIt Selection Engine — "Everyone Gets a Great Workout" Change Log

Tracks the Selection Engine work order (v1.0). One task = one commit.

---

## Task 0 — Reconcile with the in-progress rewrite ✅ (blocker)

**State on entry:** `generator/trainingEngine.oblueprint.js` working copy **equals HEAD**
(12,949 lines) — no uncommitted rewrite in the tree. The incomplete 2,464-line
rewrite (which had removed the projection layer) remains **shelved in `git stash@{0}`**
from the progression work order and was NOT applied. HEAD already contains the
committed progression upgrades (config/flag, per-lift steps, anchors, telemetry,
readiness governor, cardio, spider coupling).

**Decision:** the tree is already **one stable base (HEAD)**. Nothing to land or
shelve. Verified the base builds a valid plan (weeks=8, no error). All selection
work below targets this base.

Only non-engine concurrent-agent changes are in the tree (`data/trainer-websites.json`
+ untracked files) — left untouched.
