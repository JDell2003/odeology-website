# Arena champion clips — drop folder

All clips: MP4 H.264, **9:16 vertical**, character centered, no audio track.
Idle loops 6–15s seamless; cutscenes (reveal/promote/demote) 8–12s one-shots.

Ladder (2026-07-10): Peasant → Squire → [Ranger / Mage / Berserker] → Knight → King.
Ghost and Monk no longer exist. Specialists are ONE level, three shapes —
switching between them is lateral (no cutscene).

## Exact filenames (34 clips)

Idle loops — Peasant / Squire / Knight / King get all 5 states:
    peasant_dominant  peasant_thriving  peasant_steady  peasant_struggling  peasant_critical
    squire_dominant   squire_thriving   squire_steady   squire_struggling   squire_critical
    knight_dominant   knight_thriving   knight_steady   knight_struggling   knight_critical
    king_dominant     king_thriving     king_steady     king_struggling     king_critical

Specialists get only good/bad:
    ranger_thriving     ranger_struggling
    mage_thriving       mage_struggling
    berserker_thriving  berserker_struggling

Cutscenes:
    peasant_reveal      (one-time, every new user's entry — the only reveal)
    squire_promote      (arriving peasant→squire)
    specialist_promote  (arriving squire→specialist, SHARED by all three)
    knight_promote      (arriving specialist→knight)
    king_promote        (arriving knight→king, the coronation)
    squire_demote       (falling FROM squire → peasant)
    knight_demote       (falling FROM knight → specialist)
    king_demote         (falling FROM king → knight, the dethroning)

Specialist demotions are message-only — no clip.

All files go flat in this folder as `<name>.mp4`. After adding a file, flip
its slot from null to true in CHAMP_MEDIA.clips in js/leaderboard.js
(promote clips for specialists live under clips.specialist). Anything not
present falls back to the built-in SVG scenes automatically.
