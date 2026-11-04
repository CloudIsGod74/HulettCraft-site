# Support mail and application-only forwarding

The website continues to send only to **support@hulettcraft.com**. Its source, public pages and Pages configuration do not contain personal forwarding addresses. On October 27, 2026, the owner verified support itself as a Cloudflare destination and reported that retrying the saved production application successfully delivered its notification. Keep that working sending setup and verified alias.

This optional, separate Email Routing Worker forwards every support message to one primary inbox. It copies **only signed website application notifications** to the additional review inboxes. The real inbox addresses exist only in the Worker's private `SUPPORT_FORWARD_TO` Secret. All destinations must be Verified in the same Cloudflare account before testing. The website never looks up that list.

Cloudflare documents [free sending to verified destinations](https://developers.cloudflare.com/email-service/platform/pricing/) and [forwarding to multiple destinations with an Email Worker](https://developers.cloudflare.com/email-service/platform/limits/). The Worker uses Workers Free resources and remains subject to its CPU/request/log limits. It does not require purchasing the arbitrary-recipient Email Sending plan. No plan upgrade, deployment, route, DNS, MX, account credential, KV or R2 change is automated by this repository.

## Why a Worker

A normal Email Routing rule has one destination. Duplicate rules for support do not create a distribution list. Cloudflare's [email handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/) can call `message.forward()` separately for selected verified inboxes. This implementation preserves the original message rather than rebuilding its body, attachments, sender, subject or recipient headers. Forwarding does not add the other personal inboxes to To/Cc headers.

Ordinary support mail must remain private to the primary inbox. Matching a From address or Subject alone would allow an external sender to imitate an application. Instead, the website adds an HMAC-SHA256 marker in `X-Hulettcraft-Application` when the shared signing Secret is configured. The Worker verifies the marker and exact subject before copying the notification. The marker binds the issuance time, application ID and subject, expires after seven days, and permits five minutes of clock skew. Missing, invalid, expired or forged markers go only to the primary inbox. A missing or mismatched signing key also preserves primary delivery without sharing the message.

The marker authenticates the website-created routing token, not the entire MIME body. A reviewer who possesses a valid message could replay its token and matching subject during the seven-day window. There is no replay ledger or exactly-once guarantee. Never publish raw application emails/markers or share the signing key. This mechanism is not administrator login, applicant verification, anti-spam protection or permission to join a server.

## Private settings

| Where                                           | Secret                          | Value                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Forwarding Worker only                          | `SUPPORT_FORWARD_TO`            | Comma-separated Verified inboxes, **primary inbox first**, additional application reviewers after it. Example placeholders: `primary@example.com,reviewer@example.com`. Replace them privately; never commit actual addresses. |
| Forwarding Worker and website Pages environment | `APPLICATION_FORWARDING_SECRET` | The exact same randomly generated 64-character hexadecimal value in both places. Generate it with a password manager and store it as a Secret; do not paste it into chat, Git, commands or screenshots.                        |

The website signing setting is optional for existing one-inbox delivery. When missing/invalid, notifications still go to support using the existing sending API, but additional reviewers receive no copy. The Worker recipient Secret is required: missing/invalid recipients reject the message without forwarding, so set and verify it before attaching any route.

Up to 10 plain ASCII inbox addresses are supported; duplicates are removed case-insensitively. Empty entries, display names, CR/LF, excessive values and HulettCraft-domain destinations are rejected. Do not put support, the temporary test alias or another HulettCraft alias in the destination list: that would loop mail back into routing.

## Preparation and local checks

The Worker is `workers/support-forwarder/index.ts`; the website shares only the marker implementation, never the inbox list. Its separate Wrangler example has no `addresses` or HTTP routes, and disables workers.dev/preview URLs. The website's own Wrangler settings and Pages build stay unchanged.

From the repository root:

```sh
npm ci
npm test
npm run check
npm run build
./node_modules/.bin/wrangler deploy --dry-run --config workers/support-forwarder/wrangler.example.jsonc --outdir /tmp/hulett-support-forwarder
```

The last command bundles the Worker without deploying it. The resulting `index.js` can be reviewed and used in Cloudflare's Worker code editor; do not paste the TypeScript entry alone because it imports the shared marker helper. Use the existing Wrangler version installed with the repository. No new package or service is needed.

Automated tests use synthetic addresses, fixed test keys and mocked forwards. They cover multiple inboxes, primary-only mail, forged subjects/senders/markers, key mismatch, expiry, duplicate destinations, loop prevention, malformed settings and partial failure without logging private data. The built Astro Pages/workerd test verifies a real outgoing request containing a cryptographically valid marker and support as the sole recipient. Local tests do not prove native Email Routing acceptance or inbox delivery.

## Review, test, then switch

Do these only after approval of the concrete code and routing change. This repository deliberately performs no deployment or routing update automatically. Keep the current support rule's destination/action available privately for rollback.

1. Review the code and checks. Confirm the primary and additional inboxes are Verified in Email Routing; keep support itself Verified as well.
2. Create/deploy the separate `hulettcraft-support-forwarder` Worker with the reviewed bundle and both Worker Secrets. Do not replace the existing support rule yet. No Email Sending binding, API token, R2, KV or public HTTP endpoint is needed on this Worker.
3. For an initial routing check, create only `support-forwarding-test@hulettcraft.com` → **Send to a Worker** → this Worker. Send one ordinary synthetic email to that alias. It must arrive at the primary inbox and must not reach the additional inbox. This leaves production support routing unchanged. Check Spam/Junk too.
4. Configure the matching `APPLICATION_FORWARDING_SECRET` on the authorized website Pages environment and deploy the reviewed website change after approval. Pages settings require a new deployment. Existing notifications remain supported if the setting is absent, but will not be copied.
5. After approval, edit the existing exact support rule from **Send to an email** to **Send to a Worker**, selecting the tested Worker. Do not add a duplicate support rule, remove its verified destination, change MX/DNS, or point support back to itself.
6. Submit one synthetic application on the deployed `/join`. Check the same host's admin record, the Worker's aggregate logs, and **both actual inboxes**, including Spam/Junk. Website/API acceptance alone does not prove forwarding to either inbox.
7. Send one ordinary synthetic support email. It must reach only the primary inbox. Remove the temporary test rule after review; keep all verified destinations needed by production.

Until the website signature and Worker are both live, positive application-only forwarding cannot be confirmed. A normal email sent from Outlook with an application-looking subject intentionally tests primary-only handling, not the signed application path. Do not disable the marker to make such a test copy to another person.

## Failure handling and rollback

All selected forwards are awaited independently, so one failing inbox does not prevent attempting the others. If any forward fails, the Worker logs only counts/failed list positions and throws a generic failure. It never logs personal addresses, headers, message contents, marker values, provider error text or secrets. Some recipients may already have received a copy; no atomic delivery or automatic retry policy is assumed. Inspect Cloudflare activity and every intended inbox before resending. Completed support acceptance in Admin is not a per-inbox delivery report and may suppress another application-email retry.

If either live test fails, restore the previous support rule's **Send to an email** action and original primary destination. Keep the verified support address and existing website sending settings. Changing a Worker Secret affects that Worker independently of the website; rotating the signing key requires updating both sides and testing again. Do not reuse an application submission or force its saved email state to failed merely to test a new recipient. Send a new clearly synthetic test or handle a missing copy privately after review.
