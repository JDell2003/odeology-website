const DEFAULT_BASE_URL = 'https://odeology.up.railway.app';
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
        subject: 'Welcome to ODEOLOGY: your dashboard is live',
        preheader: 'Your free account is active. Start with training, nutrition, and check-ins.',
        greeting: hey,
        intro: 'Your ODEOLOGY account is ready. You can run training, nutrition, and progress tracking from one place.',
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
        subject: 'You are in: ODEOLOGY updates and coaching insights',
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
        subject: 'Reset your ODEOLOGY password',
        preheader: 'Use the secure reset link to set a new password.',
        greeting: hey,
        intro: `Use the button below to reset your password. This link expires in ${Math.max(10, resetMins)} minutes.`,
        bullets: [
          'If you did not request this, you can ignore this email',
          'For security, the link can only be used one time'
        ],
        ctaLabel: 'Reset Password',
        ctaUrl: resetUrl
      };
    case 'Password Reset Completed':
      return {
        key: 'password_reset_completed',
        subject: 'Your ODEOLOGY password was updated',
        preheader: 'Your account password has been changed successfully.',
        greeting: hey,
        intro: 'Your password is now updated and your account is secure.',
        bullets: [
          'If this was not you, reset your password again immediately',
          'Review your account details and active sessions'
        ],
        ctaLabel: 'Open Account',
        ctaUrl: accountPage
      };
    case 'Friend Request Received':
      return {
        key: 'friend_request_received',
        subject: 'New friend request on ODEOLOGY',
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
        preheader: preview || 'A teammate sent you a message in ODEOLOGY.',
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
        subject: 'New ODEOLOGY team update',
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
        subject: 'Your ODEOLOGY intake was received',
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
        subject: 'ODEOLOGY account update',
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

function renderEmailHtml(spec) {
  const bulletsHtml = (spec.bullets || [])
    .map((line) => `<li style="margin:0 0 8px;">${escapeHtml(line)}</li>`)
    .join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(spec.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;opacity:0;max-height:0;overflow:hidden;">${escapeHtml(spec.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f6;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:#111827;color:#f9fafb;padding:18px 24px;font-size:18px;font-weight:700;letter-spacing:1px;">ODEOLOGY</td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(spec.greeting)}</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(spec.intro)}</p>
              ${(spec.bullets || []).length ? `<ul style="margin:0 0 20px 18px;padding:0;font-size:14px;line-height:1.5;color:#374151;">${bulletsHtml}</ul>` : ''}
              <p style="margin:0 0 20px;">
                <a href="${escapeHtml(spec.ctaUrl)}" style="display:inline-block;background:#d18d2f;color:#111827;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">${escapeHtml(spec.ctaLabel)}</a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">You are receiving this because of activity on your ODEOLOGY account.</p>
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
    'You are receiving this because of activity on your ODEOLOGY account.'
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
    subject: String(spec.subject || 'ODEOLOGY update'),
    preheader: String(spec.preheader || ''),
    ctaLabel: String(spec.ctaLabel || 'Open Dashboard'),
    ctaUrl: String(spec.ctaUrl || buildUrl('/dashboard.html')),
    html: renderEmailHtml(spec),
    text: renderEmailText(spec)
  };
}

module.exports = {
  buildKlaviyoEmailTemplate
};
