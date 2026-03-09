# Klaviyo Triggered Email Templates (Backend Wired)

Klaviyo events sent by `core/emailEvents.js` now include prebuilt visual email payloads.

Each emitted event carries:

- `ode_email_template_key`
- `ode_email_template_version`
- `ode_email_subject`
- `ode_email_preheader`
- `ode_email_cta_label`
- `ode_email_cta_url`
- `ode_email_html`
- `ode_email_text`

## How to use in a Klaviyo flow email

1. Trigger a flow from one of your event names (for example `Account Created`).
2. In the email content, bind:
   - Subject: `{{ event.ode_email_subject }}`
   - Preheader: `{{ event.ode_email_preheader }}`
   - Body HTML block: `{{ event.ode_email_html }}`
3. Optional plain text fallback:
   - `{{ event.ode_email_text }}`

## Event profile mode reminder

- `KLAVIYO_EVENT_PROFILE=free` sends only allowlisted events.
- `KLAVIYO_EVENT_PROFILE=all` sends every wired event.
- `KLAVIYO_ENABLED_EVENTS=Event A,Event B` overrides with an explicit list.

## Base URL used in CTAs

CTA links use:

1. `APP_BASE_URL`
2. `PUBLIC_APP_URL`
3. `SITE_URL`
4. Fallback: `https://odeology.up.railway.app`

