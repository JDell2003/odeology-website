# Klaviyo Flow Automation

This repo now includes a script to create/update all ODEOLOGY event-triggered flows in Klaviyo.

## Command

```bash
npm run klaviyo:flows
```

Equivalent:

```bash
node --env-file .env scripts/klaviyo-setup-flows.js
```

## Required env vars

At least one of:

- `KLAVIYO_PRIVATE_API_KEY`
- `KLAVIYOPRIVATEAPIKEY`
- `KLAVIYO_API_KEY`
- `CHATSFULLACCESS`

Recommended for first run:

- `KLAVIYO_FLOW_BOOTSTRAP_EMAIL` (valid email)

Optional:

- `KLAVIYO_FLOW_NAME_PREFIX` (default: `ODE -`)
- `KLAVIYO_FLOW_PROTOTYPE_ID` (force a specific existing send-email flow as the prototype)

## What the script does

1. Ensures each ODE event metric exists (seeds with a bootstrap event if needed).
2. Finds an existing Klaviyo **send-email** flow to use as the prototype.
3. Creates missing flows per event trigger using that prototype definition.
4. Attempts to set each flow and flow actions to `live`.
5. Prints a JSON summary of created/updated/skipped/failed items.

## Notes

- If no existing send-email flow exists, create one manually in Klaviyo first, then rerun.
- Sender/domain compliance in Klaviyo can still block actual sends until account settings are verified.
