---
sidebar_position: 9
title: Support desk
---

Platform administrators open **Admin** from the signed-in user menu, then select **Support desk**. Organisation administration does not grant platform support access. The desk covers private requests from all Users, including Users without an active organisation.

## Find and answer a request

Select a request to open its messages. Expand **Support overview** to see open, unassigned and waiting counts, the oldest unanswered requests, and response statistics. Open **Case tools and filters** for search and work controls. Search checks subjects and public messages; it does not expose Internal notes in customer search. Enter the filter values shown by each field and choose **Apply filters**. A blank field removes its filter.

Write a public reply in **Message**, optionally add Files, and select **Send message**. Sent messages cannot be edited; send a correction as another message. Select **Internal note (staff only)** for information that must stay within the support team. Notes and their attachments stay private and do not change whether the User or support owes a reply.

**New request** lets an admin initiate contact with an existing User. Supply that User's ID, a subject and the first message. Admin-initiated requests start with human handling.

## Manage work

- **Take Case** assigns the request to you and takes human control. Use the administrator ID field to assign another current platform admin; leave it blank to unassign.
- Choose **Low**, **Normal**, **High** or **Urgent**. Choose whether the request is **Waiting on support**, **Waiting on User** or **Waiting externally**.
- **Snooze until** hides work until a chosen local date/time; an empty value clears snooze. A User reply wakes snooze immediately. Expiry never reopens a request resolved meanwhile.
- Shared Tag buttons add or remove Tags. **Clear Tags** clears the selection. Add shared Tags and saved text replies through the shared-name fields. Selecting a saved reply inserts it into the composer for review.
- **Resolve** finishes the current cycle. A User reply always reopens the same request into a new cycle. There is no inactivity auto-close.

If another admin changed the request, refresh before saving again. A stale edit returns a conflict rather than overwriting their work.

## Translation, AI and hours

Open **Support settings** to choose natively supported locales, the fallback admin locale, feedback and the reply expectation. If settings or documentation cannot load, an error appears. Choose **Retry** to reload the failed information. Admin locale choices must be application locales. **My working locale** controls additional viewing translations. Use **Translate to my working language** on a message when needed.

AI and translation have separate enable switches. Their providers must first be configured by the app operator. Enter explicit monthly/per-User call limits, maximum text sizes, concurrency, attempts and timeout before enabling them. Exceeding an allowance preserves human messaging.

Successful outbound translation publishes automatically. **Preview translation before publishing** holds the rendered reply for review. A held or failed reply offers **Retry**, **Send original** and **Publish preview**. If the support language changes while a reply is held, it automatically prepares the reply in the new language. Any earlier preview is cleared; review the new preview before choosing **Publish preview**. When the new language matches the authored message, the original text is used and preview approval is still required if selected. A failed translation never silently sends untranslated text. **Show original** reveals the authored text.

**Talk to a person**, **Take Case**, or a public staff reply stops unfinished AI answers. Human control persists across reopening. **Re-enable AI for this Case** is an explicit admin action. AI uses approved public documentation, provides source links, and hands off when evidence or automation is unavailable.

The documentation section shows release status. Upload the release manifest supplied by the app operator to refresh help content, or **Withdraw** a release to stop using it. A failed refresh keeps the previous authorised compatible release. Human support continues without a valid AI corpus.

Configure human hours with a time zone, weekday windows and holiday dates. Hours communicate availability; they do not enforce a response-time promise or pause the calendar-time metrics. Enabled AI may answer outside those hours.

## Metrics and feedback

Response statistics use Cases created since the selected date. The overview shows the median, p95, sample count and unanswered count; a partial sample is explicitly labelled. First human response includes time spent with AI. Handoff wait starts when human help is requested. Pending translations and notes do not satisfy reply clocks, and consecutive User messages do not reset an outstanding request.

Feedback is an optional one-click unhappy/neutral/happy rating after a genuine resolved exchange. Happy ratings divided by all responses form positive CSAT, with human and AI exchanges shown separately. Ratings never change the request's lifecycle. Reports describe retained data; Purged history is removed from them.

## Redaction and account lifecycle

For sensitive content, enter a **Redaction reason (audit)** and choose **Redact**. Original text, translations and attachment access are removed; a tombstone remains. Unfinished AI answers that used public message history are invalidated. Storage cleanup may remain pending while recent upload authorisations expire. A Purge may ask you to retry after five minutes rather than report unfinished cleanup as complete.

Closing a User blocks their Support access and autonomous replies while staff retain grace-period access. Restoring a User does not resume old automation. Purge removes related identifiable history and Files. App-configured retention may also remove resolved requests; there is no default resolved-request expiry.
