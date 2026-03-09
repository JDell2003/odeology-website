# Klaviyo Free-Plan Event Mode

By default, backend Klaviyo emission now runs in `free` mode (`KLAVIYO_EVENT_PROFILE=free`).

Only these events are sent:

- `Account Created`
- `Lead Submitted`
- `Lead Nurture Channel Enrolled`
- `Support Request Received`
- `Password Reset Requested`
- `Password Reset Completed`
- `Friend Request Received`
- `Message Received`
- `Workout Share Invite Received`
- `Daily Check-In Saved`
- `Weekly Weigh-In Logged`
- `Workout Logged`
- `Pain Report Submitted`
- `High Pain Report Submitted`
- `Pain Follow-Up Submitted`

## Override modes

- Send everything: `KLAVIYO_EVENT_PROFILE=all`
- Disable all: `KLAVIYO_EVENT_PROFILE=none`
- Custom exact allowlist: `KLAVIYO_ENABLED_EVENTS=Event A,Event B,Event C`
