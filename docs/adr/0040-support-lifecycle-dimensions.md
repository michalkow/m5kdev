# Support lifecycle, waiting, snooze and handling are independent

The planned Support module records open/resolved lifecycle independently from waiting responsibility (support, User or external), snoozed-until and human/AI handling. A combined status would conflate who owes the next action, temporary work visibility and who may answer; independent dimensions preserve those facts and let the Support desk derive simple views.

## Considered Options

- **One open/pending/snoozed/resolved enum** — rejected: it cannot describe an open Case waiting externally and snoozed until tomorrow without losing one of those facts.
- **Snooze automatically pauses customer-wait measurements** — rejected: hiding work from a queue does not mean the User stopped waiting. Any later SLA pause rule must be an explicit policy.

## Consequences

- A resolved Case can reopen into another Resolution cycle; resolution is not permanent transcript closure.
- Historical transitions must retain all dimensions, independently of the current list view.
- AI-to-human handoff does not itself resolve a Case or erase the User's elapsed wait.
