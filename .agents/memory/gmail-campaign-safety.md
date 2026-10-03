---
name: Gmail campaign delivery invariants
description: Product requirements and safety constraints for personalized Gmail campaigns.
---

# Product invariants

- Limit a campaign to 100 recipients. Send each person a separate, individually addressed email; do not use shared To, CC, or BCC headers.
- Collect each recipient’s email, name, company, and role. Support `{{name}}`, `{{company}}`, and `{{role}}` personalization.
- Let the sender review personalized messages and require explicit approval before sending.
- Do not send real emails during development.
- Allow sending only when the signed-in user’s verified primary email matches the connected Gmail account.
- A timeout or other ambiguous send failure may have delivered the message. Do not automatically resend it. Keep the same campaign ID and payload for an explicit retry, and tell the sender to check Gmail Sent before starting a different batch.

**Why:** This app is intended for deliberate, personalized outreach; accidental duplicates or sending through a different identity violate that intent.

**How to apply:** Preserve these constraints in future UI, API, queue, and test changes. Any send retry logic must distinguish definite Gmail rate-limit rejections from ambiguous delivery outcomes.