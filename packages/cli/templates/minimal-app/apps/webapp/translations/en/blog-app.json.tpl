{
  "layout": {
    "brand": {
      "eyebrow": "Framework Starter",
      "tagline": "Opinionated enough to ship, compact enough to understand in one sitting."
    },
    "workspace": {
      "eyebrow": "Included by Default",
      "title": "Auth, modules, and one honest feature.",
      "body": "This starter keeps the stack visible: Better Auth, Drizzle, tRPC, React Router, HeroUI, and a single editorial posts module.",
      "local": "Local SQLite",
      "auth": "Better Auth"
    },
    "navigation": {
      "posts": "Posts"
    },
    "push": {
      "eyebrow": "Browser push",
      "body": "Enable notifications for this browser profile. Requires HTTPS in production, VAPID keys on the server, Redis for the worker, and a running server process.",
      "cta": "Enable push for this device",
      "enabled": "This browser is registered for push.",
      "denied": "Notification permission was denied.",
      "unsupported": "Push messaging is not supported in this browser.",
      "noVapid": "Server is missing VAPID public key configuration.",
      "badSubscription": "Could not read push subscription from the browser.",
      "failed": "Could not enable push. Check the console and server logs.",
      "vapidMissing": "Server did not return a VAPID key — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then restart.",
      "blockedHint": "Notifications are blocked for this site. Enable them in the browser address bar or site settings, then try again.",
      "permissionGranted": "Permission granted — tap below to register this browser with the server."
    },
    "account": {
      "eyebrow": "Signed In As",
      "light": "Light mode",
      "dark": "Dark mode",
      "signOut": "Sign out"
    },
    "header": {
      "eyebrow": "Minimal Blog Platform",
      "title": "Editorial control panel",
      "runtime": "tRPC + URL state + HeroUI"
    }
  },
  "posts": {
    "hero": {
      "eyebrow": "Posts Module",
      "title": "Build, refine, and publish without losing the shape of the stack.",
      "body": "The example module is intentionally complete: filtered list queries, modal-driven create and edit flows, publish actions, soft deletion, and a live preview pane.",
      "new": "Create post",
      "syncing": "Refreshing",
      "synced": "Live against the local database"
    },
    "stats": {
      "total": "Total",
      "published": "Published",
      "drafts": "Drafts"
    },
    "filters": {
      "searchLabel": "Search posts",
      "searchPlaceholder": "Search by title, slug, excerpt, or body",
      "statusLabel": "Status",
      "all": "All posts",
      "draft": "Draft",
      "published": "Published"
    },
    "meta": {
      "updated": "Updated",
      "published": "Published"
    },
    "actions": {
      "edit": "Edit",
      "publish": "Publish",
      "delete": "Delete"
    },
    "empty": {
      "eyebrow": "Nothing yet",
      "title": "Your editorial desk is ready for the first post.",
      "body": "Create a first entry to see the full loop: draft creation, inline editing, publishing, and soft deletion. Seed data appears after you run the scaffolded seed script.",
      "action": "Write the first post"
    },
    "pagination": {
      "summary": "Page {{page}} of {{pageCount}}",
      "previous": "Previous",
      "next": "Next"
    },
    "preview": {
      "eyebrow": "Selected Draft",
      "emptyTitle": "Preview panel",
      "emptyBody": "Choose a post from the list to inspect the current draft or published copy.",
      "updated": "Updated",
      "openEditor": "Open in editor"
    },
    "editor": {
      "newEyebrow": "New draft",
      "editEyebrow": "Update draft",
      "newTitle": "Shape a new post",
      "editTitle": "Refine this post",
      "fields": {
        "title": "Title",
        "slug": "Slug",
        "excerpt": "Excerpt",
        "content": "Content"
      },
      "cancel": "Cancel",
      "save": "Save changes",
      "create": "Create draft"
    },
    "deleteDialog": {
      "title": "Archive this post?",
      "body": "The post will be soft-deleted and removed from the main list.",
      "confirm": "Archive post",
      "cancel": "Keep it"
    },
    "toast": {
      "created": "Draft created.",
      "updated": "Post updated.",
      "published": "Post published.",
      "deleted": "Post archived.",
      "validation": "Title and content are required."
    }
  }
}
