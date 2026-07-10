# Arena champion clips

Drop generated clips here using the exact convention `<caste>_<slot>.mp4`:
- castes: king knight berserker ranger monk mage squire ghost peasant
- slots: dominant thriving steady struggling critical (6-15s seamless loops)
         promote demote (8-12s one-shots, owned by the caste you ARRIVE in)
- spec: MP4 H.264, 720p 16:9, no audio track

Skips (unreachable): king_demote, peasant_promote.
After adding a file, flip its slot from null to true in CHAMP_MEDIA.clips
in js/leaderboard.js. Everything else falls back to the SVG scenes.
