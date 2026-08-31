# One Owner, transferred only by platform Admin

An Organization has exactly one Owner. Invite and org self-service cannot grant or change that Role. Only a User-role `admin` (AuthAdminOrganizationManagement) transfers it: promote an active Member and demote the previous Owner in one operation. The Owner cannot leave; they delete the Organization or an Admin transfers first.

## Considered Options

- **Last Owner transfers themselves, or multiple Owners** — rejected: Owner is a unique seat; org members UI must not mint a second one via invite or role picker.
- **Follow-up after Membership-before-User** — rejected: invite creates a live seat immediately, so Owner has to be excluded from assignable invite roles in the same cut.

## Consequences

- Previous Owner demotes to Organization Role `admin`.
- Upgrade does not auto-demote extra Owners. While more than one live Owner exists, Auth refuses Owner grants and transfer; an Admin demotes extras to `admin` by role update.
- Admin add-member may assign `owner` only when the Organization has no live Owner (repair). Otherwise add-member cannot assign `owner`; transfer is the Owner write.
