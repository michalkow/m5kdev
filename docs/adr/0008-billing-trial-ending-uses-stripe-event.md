# Billing trial-ending email uses Stripe trial_will_end

Billing sends the Trial cancel-warning email from Stripe `customer.subscription.trial_will_end` (about three days before trial end), not a Workflow or Recurrence clock. Stripe already owns Trial length and fires that event; a second scheduler would drift from Stripe and add queue machinery Billing does not otherwise use.

## Considered Options

- **Workflow/cron on local `trialEnd`** — rejected: a second clock next to Stripe.
- **App-owned hook only** — rejected: every Billing app would copy the same send path; EmailModule is already the mail shell.
