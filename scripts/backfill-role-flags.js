/* ====================================================================
   ROLE BACKFILL — pre-deploy gate for the role-based nav/access work.

   Accounts created before the role model may lack the admin_notes flags
   the new model resolves from. This script:
     1. computes the role every account resolves to (exact production
        logic — buildAuthUserFromRow semantics via the exported helpers)
     2. cross-references trainer signals (app_trainer_profiles row,
        app_trainer_pages count, app_trainer_clients count)
     3. flags mismatches both ways
     4. with --apply, fixes ONLY the obvious case: trainer profile AND
        published trainer page(s) but not resolving trainer -> add the
        'trainer' flag. Everything else is listed for a human.

   Usage:
     node --env-file .env scripts/backfill-role-flags.js          # dry run
     node --env-file .env scripts/backfill-role-flags.js --apply  # fix obvious
   ==================================================================== */
const db = require('../core/db');
const { isOwnerUser, notesHasFlag, setAdminNoteFlag } = require('../core/authRoutes');

const APPLY = process.argv.includes('--apply');

// Mirror of buildAuthUserFromRow (core/authRoutes.js) + odeRoleFlags (js/main.js):
// owner is a floor; client is the default state for flagless accounts.
function resolveRole(row) {
  const notes = String(row.admin_notes || '').trim();
  const owner = isOwnerUser(row);
  const trainer = notesHasFlag(notes, 'trainer') || owner;
  const manager = notesHasFlag(notes, 'manager') || owner;
  const explicitClient = notesHasFlag(notes, 'client') || owner;
  if (owner) return 'owner';
  if (trainer && explicitClient) return 'dual';
  if (trainer) return 'trainer';
  if (manager) return 'manager';
  return 'client';
}

(async () => {
  const users = (await db.query(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.display_name,
      u.created_at,
      COALESCE(u.admin_notes, '') AS admin_notes,
      (tp.user_id IS NOT NULL) AS has_trainer_profile,
      COALESCE(tp.full_name, '') AS trainer_profile_name,
      COALESCE(pg.page_count, 0)::int AS trainer_page_count,
      COALESCE(cl.client_count, 0)::int AS trainer_client_count
    FROM app_users u
    LEFT JOIN app_trainer_profiles tp ON tp.user_id = u.id
    LEFT JOIN (
      SELECT trainer_user_id, count(*) AS page_count
      FROM app_trainer_pages GROUP BY trainer_user_id
    ) pg ON pg.trainer_user_id = u.id
    LEFT JOIN (
      SELECT trainer_user_id, count(*) AS client_count
      FROM app_trainer_clients GROUP BY trainer_user_id
    ) cl ON cl.trainer_user_id = u.id
    ORDER BY u.created_at ASC;
  `)).rows;

  const report = [];
  const obviousFixes = [];
  const ambiguous = [];
  const reverse = [];

  for (const row of users) {
    const before = resolveRole(row);
    const isTrainerResolved = before === 'trainer' || before === 'dual' || before === 'owner';
    const trainerSignals = row.has_trainer_profile || row.trainer_page_count > 0 || row.trainer_client_count > 0;

    let change = '';
    let after = before;

    if (!isTrainerResolved && row.has_trainer_profile && row.trainer_page_count > 0) {
      // Obvious: real trainer artifacts (profile + published page) but the
      // account would land on the client surface.
      change = "ADD 'trainer' flag (profile + published page)";
      obviousFixes.push(row);
      if (APPLY) {
        const nextNotes = setAdminNoteFlag(row.admin_notes, 'trainer', true);
        await db.query('UPDATE app_users SET admin_notes = $2 WHERE id = $1;', [row.id, nextNotes]);
        row.admin_notes = nextNotes;
        after = resolveRole(row);
      } else {
        after = 'trainer (after apply)';
      }
    } else if (!isTrainerResolved && trainerSignals) {
      change = 'AMBIGUOUS — trainer signals but no auto-fix (review)';
      ambiguous.push(row);
    } else if (isTrainerResolved && before !== 'owner' && !trainerSignals) {
      change = 'REVERSE — resolves trainer but zero trainer artifacts (review)';
      reverse.push(row);
    }

    report.push({
      username: row.username || '(none)',
      email: row.email || '(none)',
      display: row.display_name || '',
      notes: row.admin_notes || '(empty)',
      resolved: before,
      after: change ? after : before,
      profile: row.has_trainer_profile ? `yes${row.trainer_profile_name ? ` (${row.trainer_profile_name})` : ''}` : 'no',
      pages: row.trainer_page_count,
      clients: row.trainer_client_count,
      change: change || '—'
    });
  }

  console.log(`MODE: ${APPLY ? 'APPLY (obvious fixes written)' : 'DRY RUN (no writes)'}`);
  console.log(`accounts: ${users.length}  obvious-fix: ${obviousFixes.length}  ambiguous: ${ambiguous.length}  reverse: ${reverse.length}\n`);
  for (const r of report) {
    console.log([
      `user: ${r.username}  <${r.email}>  "${r.display}"`,
      `  admin_notes: ${r.notes}`,
      `  resolves: ${r.resolved}  ->  ${r.after}`,
      `  trainer signals: profile=${r.profile} pages=${r.pages} clients=${r.clients}`,
      `  change: ${r.change}`
    ].join('\n'));
    console.log('');
  }
  process.exit(0);
})().catch((err) => { console.error('BACKFILL FAILED:', err.message); process.exit(1); });
