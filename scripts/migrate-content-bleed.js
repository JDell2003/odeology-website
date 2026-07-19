/* One-off migration (v10 addendum A): find content programs contaminated by
   the localStorage cross-account bleed and clean them.

   - Scans app_user_profiles.profile->content_program_v2 for every account
   - Flags programs whose answered.link slug doesn't belong to the account
     owner, or whose answered.name matches none of the owner's names
   - Nulls the contaminated fields (never guesses replacements), stamps the
     owner's uid, and sets needsReview=true so the app can offer a 4-minute redo
   - Logs every change and reports a count

   Run:  node --env-file .env scripts/migrate-content-bleed.js         (dry run)
         node --env-file .env scripts/migrate-content-bleed.js --apply
*/
const db = require('../core/db.js');
const APPLY = process.argv.includes('--apply');

function norm(s) { return String(s || '').trim().toLowerCase(); }

(async () => {
  const res = await db.query(`
    SELECT p.user_id, p.profile,
           u.username, COALESCE(u.display_name, '') AS display_name,
           COALESCE(t.full_name, '') AS full_name
    FROM app_user_profiles p
    JOIN app_users u ON u.id = p.user_id
    LEFT JOIN app_trainer_profiles t ON t.user_id = p.user_id
    WHERE p.profile ? 'content_program_v2';
  `);
  let scanned = 0, flagged = 0, changed = 0;
  const log = [];
  for (const row of res.rows) {
    scanned++;
    const prog = row.profile && row.profile.content_program_v2;
    if (!prog || !prog.answered) continue;
    const a = prog.answered;
    const owner = { id: norm(row.user_id), username: norm(row.username), display: norm(row.display_name), full: norm(row.full_name) };
    const reasons = [];

    // link: slug must belong to the owner
    const link = String(a.link || '');
    const m = link.match(/\/coach\/([^/?#]+)/i);
    if (m) {
      const slug = norm(decodeURIComponent(m[1]));
      if (slug && slug !== owner.username && slug !== owner.id) reasons.push(`link slug "${m[1]}" is not ${row.username}`);
    }
    // name: a stored snapshot matching none of the owner's names
    const nm = norm(a.name);
    if (nm && nm !== owner.display && nm !== owner.username && nm !== owner.full && nm !== 'your coach') {
      reasons.push(`answered.name "${a.name}" matches no owner name`);
    }
    // uid stamp mismatch (post-v10 programs carry uid)
    if (prog.uid && norm(prog.uid) !== owner.id && norm(prog.uid) !== owner.username) {
      reasons.push(`uid stamp "${prog.uid}" is not the owner`);
    }

    if (!reasons.length) {
      // still stamp the owner uid + drop stored link/name (render-resolved now)
      if (a.link || a.name || !prog.uid) {
        delete a.link; delete a.name; prog.uid = row.user_id;
        if (APPLY) { await save(row.user_id, row.profile, prog); changed++; }
        log.push(`clean  ${row.username}: stamped uid, dropped stored link/name`);
      }
      continue;
    }

    flagged++;
    log.push(`FLAG   ${row.username}: ${reasons.join('; ')}`);
    delete a.link; delete a.name; prog.uid = row.user_id;
    prog.needsReview = true; // the app offers: "redo your program? takes 4 min"
    if (APPLY) { await save(row.user_id, row.profile, prog); changed++; }
  }
  async function save(userId, profile, prog) {
    profile.content_program_v2 = prog;
    await db.query('UPDATE app_user_profiles SET profile = $2::jsonb, updated_at = now() WHERE user_id = $1;', [userId, JSON.stringify(profile)]);
  }
  console.log(log.join('\n') || '(no programs found)');
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — scanned ${scanned} programs, flagged ${flagged} contaminated, wrote ${changed} updates`);
  process.exit(0);
})().catch((e) => { console.error('MIGRATION ERROR:', e.message); process.exit(1); });
