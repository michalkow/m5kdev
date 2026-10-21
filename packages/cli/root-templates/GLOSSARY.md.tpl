# {{APP_NAME}}

{{APP_DESCRIPTION}}

## Language
# m5k:server:start

### Tenancy

**Organization**:
The default tenancy unit. Signup creates one; a Closed Organization cannot be used.
_Avoid_: Workspace, tenant, account, company, Team

**Membership**:
A durable seat in an Organization. Invite can create it before a User exists; leave, cancel, and expiry soft-delete it; rejoin revives the same MemberId. An Organization has exactly one Owner.
_Avoid_: OrgUser; treating Invitation as the Membership; Seat (that is Seat billing)

**Member**:
The Membership principal used to attribute and authorize org-scoped assets, including invited Memberships that do not yet have a User.
_Avoid_: User (when you mean the membership), Invitation

**MemberId**:
The Membership id stamped on org-scoped rows. In organization context, `"own"` grants compare this, not UserId.
_Avoid_: UserId as the org ownership key

**User**:
The global sign-in identity. Owns personal resources that are not org tenancy. A Closed User cannot sign in.
_Avoid_: Account, Customer, Client, Member

**UserId**:
The User id. Correct key for personal resources. Not the org-scoped ownership key.
_Avoid_: MemberId

**Owner**:
The Organization Role `owner`. Exactly one per Organization. Invite and org self-service cannot grant or transfer it.
_Avoid_: multiple Owners as a product feature; inviting Owner

**Invitation**:
The accept token that attaches a User to an invited Membership. Not a person and not assignable.
_Avoid_: Waitlist code, pending Member

**Closed**:
A User or Organization in the restorable lockout state.
_Avoid_: soft-delete (that is Membership leave), deactivated, suspended, banned

**Restore**:
Returning a Closed User or Organization to usable state before Purge. Admin panel only.
_Avoid_: undelete, reactivate

**Purge**:
Permanent removal of a Closed User or Organization after the grace window.
_Avoid_: hard-delete as the User-facing noun

### Identity and access

**Actor**:
Who a server call is made on behalf of: User, Organization, or Admin. Organization scope requires a live Membership and an Organization that is not Closed. Invited Members are not Actors.
_Avoid_: Session, Principal, Request, TeamActor

**Grant**:
A permission tuple: resource, level (`user` | `organization`), role, Action, Access.
_Avoid_: Permission, Policy, ACL

**Action**:
Canonical Grant verbs: `read`, `write`, `delete`, `publish`.
_Avoid_: update, create, patch, remove

**Access**:
How wide a Grant is: `all`, `own`, `org`, `none`.
_Avoid_: Scope, Role

**Role**:
A named key at User or Organization scope. Defaults: User `user`/`admin`; Organization `member`/`admin`/`owner`.
_Avoid_: Grant, Access, permission

### Product surfaces

**Admin panel**:
The User-role admin UI at `/admin`. Organization Role `admin` does not see it.
_Avoid_: org Role admin, Billing Portal
# m5k:files:start

**File**:
An inventoried object in storage: a row plus the bytes. Personal Files stamp UserId; org-scoped Files stamp MemberId.
_Avoid_: Upload, Asset, Attachment, Blob
# m5k:files:end
# m5k:billing:start

**Plan**:
Named commercial offering in app code. Not a Stripe Product.
_Avoid_: Product, Tier, Subscription

**Subscription**:
The billed relationship for an Organization, not a User.
_Avoid_: Plan, personal User subscription

**Checkout**:
Hosted start of a Subscription when the Organization has none.
_Avoid_: Billing Portal

**Billing Portal**:
Hosted management of an existing Subscription.
_Avoid_: Checkout

**Seat billing**:
When on, billable quantity is the count of Memberships. Off (default): quantity is one.
_Avoid_: Seat as a synonym for Membership
# m5k:billing:end
# m5k:ai:start

**Conversation**:
Ordered UI transcript of AI turns.
_Avoid_: Chat, Thread (that is the store)

**Thread**:
The persisted AI memory thread behind a Conversation.
_Avoid_: using Thread for the UI surface

**Agent**:
A named AI agent the app registers. A Conversation selects which Agent answers.
_Avoid_: Assistant, Bot, MCP client
# m5k:ai:end
# m5k:mcp:start

**MCP client**:
A remote Model Context Protocol client that calls the app on behalf of a User.
_Avoid_: Agent, Connection

**MCP call**:
A tRPC procedure opted into the MCP catalog. Grant checks always run.
_Avoid_: a second tool catalog, Workflow job

**MCP allowlist**:
The Organizations a given OAuth client may pass as organizationId for a User.
_Avoid_: treating allowlist as permission to write
# m5k:mcp:end
# m5k:notifications:start

**Notification**:
A persisted inbox instance owned by a Member, classified by a Notification kind.
_Avoid_: UserId as the ownership key

**Notification kind**:
A developer-declared class of Notifications. Mute applies to the kind.
_Avoid_: Notification (that is the instance)

**Channel**:
A delivery means for a Notification: in-app, web push, mobile push, or email.
_Avoid_: Server event, Device
# m5k:notifications:end
# m5k:workflows:start

**Workflow**:
A persisted background run. Org-scoped runs stamp MemberId.
_Avoid_: Job, Queue, Task, Recurrence
# m5k:workflows:end
# m5k:tags:start

**Tag**:
A polymorphic label. Ownership is UserId, MemberId, or organizationId.
_Avoid_: Label, Category
# m5k:tags:end
# m5k:connect:start

**Connection**:
A linked third-party API account. Personal; keyed by UserId. The module id is `connect`.
_Avoid_: Connect as the product noun; login OAuth
# m5k:connect:end
# m5k:webhook:start

**Inbound callback**:
A one-shot inbound callback with an awaitable payload. Unattributed. The module id is `webhook`.
_Avoid_: Webhook (when you mean this vs Stripe Subscription sync); Connection
# m5k:webhook:end
# m5k:recurrence:start

**Recurrence**:
A repeating calendar pattern stored as a row. Not a Workflow.
_Avoid_: Workflow, cron
# m5k:recurrence:end
# m5k:server:end
