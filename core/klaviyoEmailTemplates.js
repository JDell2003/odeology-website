const DEFAULT_BASE_URL = 'https://RiseForIt.up.railway.app';
const TEMPLATE_VERSION = 'v1';

function resolveBaseUrl() {
  const configured = String(
    process.env.APP_BASE_URL
    || process.env.PUBLIC_APP_URL
    || process.env.SITE_URL
    || DEFAULT_BASE_URL
  ).trim();
  return configured.replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function buildUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return resolveBaseUrl();
  if (/^https?:\/\//i.test(raw)) return raw;
  const slashPath = raw.startsWith('/') ? raw : `/${raw}`;
  return `${resolveBaseUrl()}${slashPath}`;
}

function normalizeSentence(raw, max = 220) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, Math.max(10, max));
}

function escapeHtml(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeBullets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => normalizeSentence(line, 180))
    .filter(Boolean)
    .slice(0, 8);
}

function firstNameFromDisplayName(displayName = '') {
  const full = String(displayName || '').trim();
  if (!full) return '';
  return full.split(/\s+/g).filter(Boolean)[0] || '';
}

function shortDateLabel(raw) {
  if (!raw) return '';
  const parsed = Date.parse(String(raw));
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function eventTemplateSpec({
  eventName,
  displayName = '',
  eventProps = {}
} = {}) {
  const metric = String(eventName || '').trim();
  const firstName = firstNameFromDisplayName(displayName);
  const hey = firstName ? `Hey ${firstName},` : 'Hey,';
  const appHome = buildUrl('/dashboard.html');
  const accountPage = buildUrl('/account.html');
  const trainingPage = buildUrl('/training.html#training');
  const messagesPage = buildUrl('/friends.html');
  const resetUrl = String(eventProps?.resetUrl || '').trim() || buildUrl('/reset-password.html');
  const resetMins = Number(eventProps?.expiresInMinutes || 60);
  const preview = normalizeSentence(eventProps?.preview || '', 180);
  const fromName = normalizeSentence(eventProps?.fromDisplayName || eventProps?.fromName || 'Your teammate', 120);
  const checkInDay = normalizeSentence(eventProps?.day || shortDateLabel(eventProps?.updatedAt || Date.now()), 80);
  const weightLb = Number(eventProps?.weightLb);
  const severity = Number(eventProps?.severity);
  const painLocation = normalizeSentence(eventProps?.location || '', 80);
  const warningCount = Number(eventProps?.totalWarnings || 0);
  const highWarningCount = Number(eventProps?.highSeverityWarnings || 0);
  const warningLines = sanitizeBullets(eventProps?.topWarnings);

  switch (metric) {
    case 'Account Created':
      return {
        key: 'account_created',
        subject: 'Welcome to RiseForIt: your dashboard is live',
        preheader: 'Your free account is active. Start with training, nutrition, and check-ins.',
        greeting: hey,
        intro: 'Your RiseForIt account is ready. You can run training, nutrition, and progress tracking from one place.',
        bullets: [
          'Build or generate your workout plan and track lifts',
          'Log daily compliance, check-ins, and progress photos',
          'Share workouts with teammates and message inside the app'
        ],
        ctaLabel: 'Open Dashboard',
        ctaUrl: appHome
      };
    case 'Lead Nurture Channel Enrolled':
      return {
        key: 'lead_nurture_enrolled',
        subject: 'You are in: RiseForIt updates and coaching insights',
        preheader: 'We will send practical training and nutrition guidance you can apply right away.',
        greeting: hey,
        intro: 'You are now in our update channel for self-paced progress and coaching support.',
        bullets: [
          'Simple progress frameworks that improve consistency',
          'Workout and nutrition guidance you can act on this week',
          'Product updates that help you train smarter'
        ],
        ctaLabel: 'View Training',
        ctaUrl: trainingPage
      };
    case 'Password Reset Requested':
      return {
        key: 'password_reset_requested',
        subject: 'Reset your RiseForIt password',
        preheader: `One-tap reset link — expires in ${Math.max(10, resetMins)} minutes.`,
        greeting: hey,
        intro: `Tap the button to set a new password. The link works once and expires in ${Math.max(10, resetMins)} minutes. Didn't request this? Ignore this email — your account is safe.`,
        bullets: [],
        ctaLabel: 'Reset Password',
        ctaUrl: resetUrl
      };
    case 'Password Reset Completed':
      return {
        key: 'password_reset_completed',
        subject: 'Your RiseForIt password was updated',
        preheader: 'Your password just changed. Not you? Act now.',
        greeting: hey,
        intro: 'Your password was just changed. If that was you, you\'re all set — nothing else to do. If it wasn\'t you, reset your password again right now from the sign-in page.',
        bullets: [],
        ctaLabel: 'Open Account',
        ctaUrl: accountPage
      };
    case 'Friend Request Received':
      return {
        key: 'friend_request_received',
        subject: 'New friend request on RiseForIt',
        preheader: 'You have a new request waiting in your account.',
        greeting: hey,
        intro: `${fromName} sent you a friend request.`,
        bullets: [
          'Open Account to accept or decline requests',
          'Connected friends can message and share progress'
        ],
        ctaLabel: 'Review Requests',
        ctaUrl: accountPage
      };
    case 'Friend Request Accepted':
      return {
        key: 'friend_request_accepted',
        subject: 'Friend request accepted',
        preheader: 'You are now connected and can start messaging.',
        greeting: hey,
        intro: 'Your friend request was accepted.',
        bullets: [
          'Open Messages to start a conversation',
          'Share workouts and stay accountable together'
        ],
        ctaLabel: 'Open Messages',
        ctaUrl: messagesPage
      };
    case 'Message Received':
      return {
        key: 'message_received',
        subject: 'You received a new message',
        preheader: preview || 'A teammate sent you a message in RiseForIt.',
        greeting: hey,
        intro: preview ? `New message preview: "${preview}"` : 'You have a new message waiting.',
        bullets: [
          'Reply from your Messages tab',
          'Keep accountability conversations active day to day'
        ],
        ctaLabel: 'Open Messages',
        ctaUrl: messagesPage
      };
    case 'Owner Message Received':
      return {
        key: 'owner_message_received',
        subject: 'New message from your coach',
        preheader: preview || 'Your coach sent an update in Work Outreach.',
        greeting: hey,
        intro: preview ? `Coach message preview: "${preview}"` : 'You have a new coach message waiting.',
        bullets: [
          'Open Messages to read and respond',
          'Act quickly to stay aligned with your plan'
        ],
        ctaLabel: 'Open Messages',
        ctaUrl: messagesPage
      };
    case 'Owner Broadcast Received':
      return {
        key: 'owner_broadcast_received',
        subject: 'New RiseForIt team update',
        preheader: preview || 'A new broadcast update was sent to your account.',
        greeting: hey,
        intro: preview ? `Team update preview: "${preview}"` : 'A new team-wide update is waiting for you.',
        bullets: [
          'Open Messages to read the full broadcast',
          'Apply the update in your next training session'
        ],
        ctaLabel: 'Read Update',
        ctaUrl: messagesPage
      };
    case 'Workout Share Invite Received':
      return {
        key: 'workout_share_invite_received',
        subject: 'Workout invite received',
        preheader: 'A teammate invited you to join their workout.',
        greeting: hey,
        intro: `${fromName} invited you to join a shared workout.`,
        bullets: [
          'Accept or decline in Account requests',
          'Accepted invites sync you into the shared plan'
        ],
        ctaLabel: 'Review Invite',
        ctaUrl: accountPage
      };
    case 'Workout Share Invite Accepted':
      return {
        key: 'workout_share_invite_accepted',
        subject: 'Workout invite accepted',
        preheader: 'Your shared workout invite was accepted.',
        greeting: hey,
        intro: 'Your teammate accepted your workout invite.',
        bullets: [
          'Open Training to view active shared members',
          'Keep communication active for accountability'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Workout Share Invite Declined':
      return {
        key: 'workout_share_invite_declined',
        subject: 'Workout invite declined',
        preheader: 'Your shared workout invite was declined.',
        greeting: hey,
        intro: 'A teammate declined your workout invite.',
        bullets: [
          'You can send another invite later',
          'Use Messages to coordinate next steps'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Shared Workout Removed':
      return {
        key: 'shared_workout_removed',
        subject: 'You were removed from a shared workout',
        preheader: 'Your shared workout connection was removed.',
        greeting: hey,
        intro: 'Your shared workout access was removed by the workout owner.',
        bullets: [
          'Your account remains active with your own tracking',
          'You can build or generate a new plan anytime'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Shared Workout Left':
      return {
        key: 'shared_workout_left',
        subject: 'A teammate left your shared workout',
        preheader: 'Your shared workout member list has changed.',
        greeting: hey,
        intro: 'A teammate removed themselves from your shared workout.',
        bullets: [
          'Open Training to review current shared members',
          'Send a new invite if needed'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Daily Check-In Saved':
      return {
        key: 'daily_checkin_saved',
        subject: 'Daily check-in saved',
        preheader: 'Your daily check-in is logged.',
        greeting: hey,
        intro: checkInDay ? `Your check-in for ${checkInDay} is saved.` : 'Your daily check-in is saved.',
        bullets: [
          'Keep this streak going with tomorrow\'s check-in',
          'Consistent logging improves compliance insights'
        ],
        ctaLabel: 'Open Dashboard',
        ctaUrl: appHome
      };
    case 'Weekly Weigh-In Logged':
      return {
        key: 'weekly_weighin_logged',
        subject: 'Weekly weigh-in logged',
        preheader: 'Your weekly bodyweight data is now recorded.',
        greeting: hey,
        intro: Number.isFinite(weightLb)
          ? `Your weigh-in was saved at ${weightLb.toFixed(1)} lb.`
          : 'Your weekly weigh-in was saved.',
        bullets: [
          'Weekly consistency beats daily scale noise',
          'Use this trend to tune calories and adherence'
        ],
        ctaLabel: 'View Progress',
        ctaUrl: appHome
      };
    case 'Workout Logged':
      return {
        key: 'workout_logged',
        subject: 'Workout logged successfully',
        preheader: 'Your training session was recorded.',
        greeting: hey,
        intro: 'Your workout log is saved and progression tracking has been updated.',
        bullets: [
          'Log each session to keep your progression accurate',
          'Use notes to improve the next session quality'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Pain Report Submitted':
      return {
        key: 'pain_report_submitted',
        subject: 'Pain report received',
        preheader: 'Your pain report was logged for training adjustments.',
        greeting: hey,
        intro: painLocation
          ? `Your pain report for ${painLocation} has been logged.`
          : 'Your pain report has been logged.',
        bullets: [
          'Use exercise swaps where needed and train smart',
          'If pain escalates, reduce intensity and recover'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'High Pain Report Submitted':
      return {
        key: 'high_pain_report_submitted',
        subject: 'High pain report alert',
        preheader: 'High pain was reported. Prioritize recovery and safer options.',
        greeting: hey,
        intro: Number.isFinite(severity)
          ? `High pain severity (${severity}/10) was reported${painLocation ? ` for ${painLocation}` : ''}.`
          : 'High pain was reported in your training flow.',
        bullets: [
          'Avoid forcing painful movements',
          'Use the pain follow-up flow before your next heavy session'
        ],
        ctaLabel: 'Review Training',
        ctaUrl: trainingPage
      };
    case 'Pain Follow-Up Submitted':
      return {
        key: 'pain_followup_submitted',
        subject: 'Pain follow-up saved',
        preheader: 'Your follow-up status was recorded.',
        greeting: hey,
        intro: 'Your pain follow-up response is saved.',
        bullets: [
          'Continue training with appropriate modifications',
          'Reassess before increasing load again'
        ],
        ctaLabel: 'Open Training',
        ctaUrl: trainingPage
      };
    case 'Compliance Warnings Updated':
      return {
        key: 'compliance_warnings_updated',
        subject: warningCount > 0 ? `Compliance warning update: ${warningCount}` : 'Compliance warning update',
        preheader: warningCount > 0
          ? `${highWarningCount} high-priority warning(s) need attention.`
          : 'No active warnings right now.',
        greeting: hey,
        intro: warningCount > 0
          ? `You currently have ${warningCount} warning(s), including ${highWarningCount} high-priority item(s).`
          : 'Your account currently has no active compliance warnings.',
        bullets: warningLines.length ? warningLines : [
          'Review your dashboard and training logs',
          'Address warning patterns early to protect progress'
        ],
        ctaLabel: 'Open Dashboard',
        ctaUrl: appHome
      };
    case 'Grocery Forecast Updated':
      return {
        key: 'grocery_forecast_updated',
        subject: 'Grocery forecast updated',
        preheader: 'Your grocery cost and runout forecast has been refreshed.',
        greeting: hey,
        intro: 'Your grocery forecast is updated with current plan assumptions.',
        bullets: [
          'Review projected runout dates and monthly cost',
          'Adjust budget tier if needed before checkout'
        ],
        ctaLabel: 'Open Grocery List',
        ctaUrl: buildUrl('/overview.html#grocery-list')
      };
    case 'Lead Submitted':
      return {
        key: 'lead_submitted',
        subject: 'Your RiseForIt intake was received',
        preheader: 'We saved your details and next steps are ready.',
        greeting: hey,
        intro: 'Your intake was submitted. You can continue into training setup right now.',
        bullets: [
          'Complete your setup to generate a plan',
          'Track workouts, nutrition, and compliance in one place'
        ],
        ctaLabel: 'Start Training Setup',
        ctaUrl: trainingPage
      };
    case 'Support Request Received':
      return {
        key: 'support_request_received',
        subject: 'Support request received',
        preheader: 'We got your message and will follow up.',
        greeting: hey,
        intro: 'Your support request is in queue. We will follow up as soon as possible.',
        bullets: [
          'You can continue using your dashboard while we review',
          'Include details in replies so we can resolve faster'
        ],
        ctaLabel: 'Open Dashboard',
        ctaUrl: appHome
      };
    default:
      return {
        key: 'generic_update',
        subject: 'RiseForIt account update',
        preheader: 'You have a new update in your account.',
        greeting: hey,
        intro: `New activity detected for "${metric || 'Account Update'}".`,
        bullets: [
          'Open your account to review the latest update'
        ],
        ctaLabel: 'Open Dashboard',
        ctaUrl: appHome
      };
  }
}

/* Per-email art direction: badge glyph, accent color, and a category kicker.
   No remote images — everything is inline-styled tables and text, so it
   renders identically in Gmail, Outlook, and Apple Mail with nothing blocked. */
const EVENT_STYLE = {
  account_created: { badge: '🏆', accent: '#d18d2f', ctaText: '#131a26', kicker: 'Welcome to the climb' },
  lead_nurture_enrolled: { badge: '📬', accent: '#d18d2f', ctaText: '#131a26', kicker: 'You are on the list' },
  password_reset_requested: { badge: '🔐', accent: '#2563eb', ctaText: '#ffffff', kicker: 'Security' },
  password_reset_completed: { badge: '✅', accent: '#2563eb', ctaText: '#ffffff', kicker: 'Security' },
  friend_request_received: { badge: '🤝', accent: '#7c3aed', ctaText: '#ffffff', kicker: 'Community' },
  friend_request_accepted: { badge: '🎉', accent: '#7c3aed', ctaText: '#ffffff', kicker: 'Community' },
  message_received: { badge: '💬', accent: '#7c3aed', ctaText: '#ffffff', kicker: 'New message' },
  owner_message_received: { badge: '💬', accent: '#7c3aed', ctaText: '#ffffff', kicker: 'From RiseForIt' },
  owner_broadcast_received: { badge: '📣', accent: '#7c3aed', ctaText: '#ffffff', kicker: 'Announcement' },
  workout_share_invite_received: { badge: '🏋️', accent: '#059669', ctaText: '#ffffff', kicker: 'Train together' },
  workout_share_invite_accepted: { badge: '🎉', accent: '#059669', ctaText: '#ffffff', kicker: 'Train together' },
  workout_share_invite_declined: { badge: '🏋️', accent: '#059669', ctaText: '#ffffff', kicker: 'Train together' },
  shared_workout_removed: { badge: '🏋️', accent: '#059669', ctaText: '#ffffff', kicker: 'Shared workout' },
  shared_workout_left: { badge: '🏋️', accent: '#059669', ctaText: '#ffffff', kicker: 'Shared workout' },
  daily_checkin_saved: { badge: '✅', accent: '#059669', ctaText: '#ffffff', kicker: 'Daily check-in' },
  weekly_weighin_logged: { badge: '⚖️', accent: '#059669', ctaText: '#ffffff', kicker: 'Weekly weigh-in' },
  workout_logged: { badge: '💪', accent: '#059669', ctaText: '#ffffff', kicker: 'Workout logged' },
  pain_report_submitted: { badge: '🩹', accent: '#dc2626', ctaText: '#ffffff', kicker: 'Recovery check' },
  high_pain_report_submitted: { badge: '⚠️', accent: '#dc2626', ctaText: '#ffffff', kicker: 'Important' },
  pain_followup_submitted: { badge: '🩹', accent: '#dc2626', ctaText: '#ffffff', kicker: 'Recovery check' },
  compliance_warnings_updated: { badge: '📉', accent: '#dc2626', ctaText: '#ffffff', kicker: 'Accountability' },
  grocery_forecast_updated: { badge: '🛒', accent: '#d97706', ctaText: '#131a26', kicker: 'Meals & groceries' },
  lead_submitted: { badge: '⭐', accent: '#d18d2f', ctaText: '#131a26', kicker: 'New lead' },
  support_request_received: { badge: '🛟', accent: '#0891b2', ctaText: '#ffffff', kicker: 'Support' },
  generic_update: { badge: '🔔', accent: '#d18d2f', ctaText: '#131a26', kicker: 'Account update' }
};

function renderEmailHtml(spec) {
  const style = EVENT_STYLE[spec.key] || EVENT_STYLE.generic_update;
  const accent = style.accent;
  const bulletsHtml = (spec.bullets || [])
    .map((line) => `
              <tr>
                <td valign="top" style="width:24px;padding:0 10px 10px 0;font-size:14px;font-weight:700;color:${accent};">✓</td>
                <td style="padding:0 0 10px;font-size:14px;line-height:1.6;color:#3c4654;">${escapeHtml(line)}</td>
              </tr>`)
    .join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(spec.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f5;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;opacity:0;max-height:0;overflow:hidden;">${escapeHtml(spec.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f5;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e3e7ee;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#101623;padding:18px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:20px;font-weight:900;color:#f7fbff;letter-spacing:0.5px;">Rise<span style="color:#d18d2f;">For</span>It<span style="color:#d18d2f;">.</span></td>
                  <td align="right" style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9aa7b8;">${escapeHtml(style.kicker)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:32px 34px 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="width:56px;height:56px;border-radius:28px;background:${accent}1f;border:2px solid ${accent};font-size:26px;line-height:56px;">${style.badge}</td>
                </tr>
              </table>
              <p style="margin:20px 0 10px;font-size:21px;font-weight:800;color:#101623;">${escapeHtml(spec.greeting)}</p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3c4654;">${escapeHtml(spec.intro)}</p>
              ${(spec.bullets || []).length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">${bulletsHtml}</table>` : ''}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
                <tr>
                  <td style="border-radius:12px;background:${accent};">
                    <a href="${escapeHtml(spec.ctaUrl)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:${style.ctaText};text-decoration:none;border-radius:12px;">${escapeHtml(spec.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:11.5px;line-height:1.6;color:#98a1ad;">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(spec.ctaUrl)}" style="color:${accent};word-break:break-all;">${escapeHtml(spec.ctaUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f7f9fc;border-top:1px solid #eceff4;padding:18px 28px;">
              <p style="margin:0 0 4px;font-size:12.5px;font-weight:800;color:#3c4654;">RiseForIt — every King was once a Peasant.</p>
              <p style="margin:0;font-size:11px;line-height:1.6;color:#98a1ad;">You're receiving this because of activity on your RiseForIt account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderEmailText(spec) {
  const bulletText = (spec.bullets || []).map((line) => `- ${line}`).join('\n');
  return [
    spec.subject,
    '',
    spec.greeting,
    spec.intro,
    '',
    bulletText,
    '',
    `${spec.ctaLabel}: ${spec.ctaUrl}`,
    '',
    'You are receiving this because of activity on your RiseForIt account.'
  ].join('\n').trim();
}

function buildKlaviyoEmailTemplate({
  eventName,
  displayName = '',
  eventProps = {}
} = {}) {
  const spec = eventTemplateSpec({
    eventName,
    displayName,
    eventProps
  });
  return {
    key: String(spec.key || 'generic_update'),
    version: TEMPLATE_VERSION,
    subject: String(spec.subject || 'RiseForIt update'),
    preheader: String(spec.preheader || ''),
    ctaLabel: String(spec.ctaLabel || 'Open Dashboard'),
    ctaUrl: String(spec.ctaUrl || buildUrl('/dashboard.html')),
    html: renderEmailHtml(spec),
    text: renderEmailText(spec)
  };
}

const EMAIL_EVENT_NAMES = [
  'Account Created',
  'Lead Nurture Channel Enrolled',
  'Password Reset Requested',
  'Password Reset Completed',
  'Friend Request Received',
  'Friend Request Accepted',
  'Message Received',
  'Owner Message Received',
  'Owner Broadcast Received',
  'Workout Share Invite Received',
  'Workout Share Invite Accepted',
  'Workout Share Invite Declined',
  'Shared Workout Removed',
  'Shared Workout Left',
  'Daily Check-In Saved',
  'Weekly Weigh-In Logged',
  'Workout Logged',
  'Pain Report Submitted',
  'High Pain Report Submitted',
  'Pain Follow-Up Submitted',
  'Compliance Warnings Updated',
  'Grocery Forecast Updated',
  'Lead Submitted',
  'Support Request Received'
];

module.exports = {
  buildKlaviyoEmailTemplate,
  eventTemplateSpec,
  renderEmailHtml,
  renderEmailText,
  EMAIL_EVENT_NAMES
};
