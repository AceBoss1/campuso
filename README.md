# NAUZI — Campus Social App for NAU Students

MVP stack: **FlutterFlow** (client, Free plan) + **Firebase** (Auth/Firestore/FCM,
**Spark/free plan — no Blaze required**) + **Cloudinary** (image hosting, free tier).
FlutterFlow itself is built in its own web GUI, not in this repo — this repo holds
everything Firebase-side that needs to be version-controlled: security rules,
indexes, and the push-notification cron script.

## Why Cloudinary instead of Firebase Storage

As of late 2024, Google requires the **Blaze plan** to use Cloud Storage for Firebase
on any newly created project — Spark no longer includes a Storage bucket. Since
staying off Blaze is the point of this setup, avatars/post images/chat images are
hosted on **Cloudinary** instead (free tier: 25GB storage, 25GB bandwidth/month),
uploaded directly from the FlutterFlow client via an **unsigned upload preset** — no
backend or secret key needed, which also rules out something like Cloudflare R2 here
(R2 uploads need AWS-SigV4-signed requests, which requires a secret key that can't
safely live in a mobile client without a server to mint presigned URLs).

## Why no Cloud Functions

Cloud Functions can't be deployed at all on Firebase's free Spark plan — that's a
platform rule, not something either FlutterFlow or this repo can work around. Instead
of paying for Blaze, this MVP moves the two things the original design used Functions
for onto the client + a free external cron:

| Need | Blaze approach (archived in `functions-blaze-upgrade/`) | Spark/free approach (what's live) |
|---|---|---|
| Unique usernames | Transactional callable function | A `usernames/{username}` doc created directly by the client. Firestore only allows a **create** when no document already exists at that path, and the security rule permits create but never update — so a race between two signups is resolved by Firestore itself, no transaction needed. |
| Unread counts + notification doc on new DM | Firestore trigger (Admin SDK) | Client (sender) writes both directly: `FieldValue.increment(1)` on `unreadCount_{recipientUid}`, plus a `notifications/{recipientUid}/items` doc. Security rules already let any chat participant write to the chat doc, and any signed-in user create a notification for someone else. |
| Push notification delivery | Firestore trigger → FCM | A GitHub Actions cron job (`.github/workflows/push-notifications.yml`, free) polls Firestore every 5 minutes for unsent notification docs and sends them via FCM directly (`scripts/send-push-notifications.js`). Sending FCM messages doesn't require Blaze — only *deploying Cloud Functions* does. |

Trade-off: push notifications lag by up to ~5 minutes instead of firing instantly, and
username claims/unread counts are "good enough for MVP" rather than fully
transactional. Both are fine at MVP scale; `functions-blaze-upgrade/` has the original
Cloud Functions ready to deploy once you're ready to pay for Blaze (which, at real
usage, likely costs $0–$1/month anyway — but no card is required for what's here).

## Repo layout

```
firebase.json                    # Firebase CLI config (Firestore only)
.firebaserc                       # points the CLI at your Firebase project
firestore.rules                    # Firestore security rules
firestore.indexes.json              # composite indexes for feed/chat/notification queries
scripts/                              # cron-based push notification sender (Node)
  send-push-notifications.js
  package.json
.github/workflows/push-notifications.yml   # runs the script every 5 min
functions-blaze-upgrade/              # original Cloud Functions, NOT deployed — see above
```

## 1. One-time setup

```bash
npm install -g firebase-tools
firebase login
```

Create the Firebase project in the console (free **Spark** plan is fine — do not
upgrade to Blaze, and don't bother initializing Cloud Storage, it'll prompt you to
upgrade), then enable:
- **Authentication** → Phone provider
- **Firestore** → Native mode, `nam5` (or nearest region)
- **Cloud Messaging** — no explicit "enable" step needed, but confirm the **Cloud
  Messaging API (V1)** is enabled for the project in Google Cloud Console
  (APIs & Services → Library)

Set the project ID in `.firebaserc` (replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`).

Then create a free [Cloudinary](https://cloudinary.com) account:
1. Note your **cloud name** from the dashboard.
2. Settings → Upload → Upload presets → **Add upload preset** → set **Signing Mode**
   to **Unsigned**. Optionally restrict it to a `nauzi/` folder and set a max file
   size. Note the preset name.

## 2. Deploy rules & indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 3. Set up the push-notification cron

1. In the Firebase console: Project settings → Service accounts → **Generate new
   private key**. This downloads a JSON file — do not commit it.
2. In your GitHub repo settings → Secrets and variables → Actions, add a secret named
   `FIREBASE_SERVICE_ACCOUNT_KEY` with the full contents of that JSON file.
3. That's it — `.github/workflows/push-notifications.yml` runs automatically every 5
   minutes once it's on your default branch. You can also trigger it manually from the
   Actions tab (`workflow_dispatch`).

The script only sends a push for `notifications/{uid}/items/{notifId}` docs that have
**`pushSent: false`** — make sure every notification doc you create client-side in
FlutterFlow includes that field (see step 4.2 below), otherwise the cron job's query
won't pick it up.

## 4. Firestore data model

Same schema as the original spec, with one addition — notification docs need a
`pushSent` boolean:

```
notifications/{uid}/items/{notifId}
  - type: "like" | "comment" | "message" | "system"
  - fromUserId: string
  - postId: string (optional)
  - text: string
  - isRead: bool
  - pushSent: bool        // NEW — set to false when created; the cron job flips it
  - createdAt: timestamp
```

Everything else (`users`, `posts` + `likes`/`comments`, `chats` + `messages`,
`reports`, `usernames`) is unchanged from the original spec and is implemented as-is
in `firestore.rules` / `firestore.indexes.json`.

## 5. FlutterFlow build order

FlutterFlow's Free plan is enough for all of this — the one thing to avoid is
**Custom Code** (Dart custom functions/actions), which is gated on paid tiers. Every
piece below uses only built-in FlutterFlow actions/logic, no Dart.

1. **Connect Firebase** in FlutterFlow (Settings → Firebase → import the same
   project). Enable Phone Auth in FlutterFlow's Auth settings.
2. **Auth flow**: Splash → Phone Entry (+234 fixed prefix) → OTP Verify (FlutterFlow's
   built-in phone auth flow) → Profile Setup (name, username, department, level,
   avatar).
   - On Profile Setup, attempt to **create** `usernames/{username}` (lowercased) with
     `{ uid: currentUserUid, createdAt: now }` using FlutterFlow's "Create Document"
     backend action. If it succeeds, then update `users/{uid}.username`. If it fails
     with a permission error, show "username taken" inline — that failure *is* the
     uniqueness check (see the rules explanation above).
   - **Test on a real device** — reCAPTCHA for phone auth is flaky in FlutterFlow's
     in-browser test preview.
3. **Feed + Create Post + Post Detail** (core loop): Firestore query on `posts` where
   `isHidden == false`, order by `createdAt` desc, paginated. Create Post uploads
   images to Cloudinary first (see the upload recipe below), then writes the post doc
   with the returned URLs in `imageUrls`.
4. **Profile (own/other) + Edit Profile** — avatar upload uses the same Cloudinary
   recipe below.
5. **Chat List + Chat Detail (DM)**:
   - Compute the deterministic chat id with a **Conditional action** (no custom code
     needed): if `currentUid < otherUid` then `chatId = currentUid + "_" + otherUid`,
     else `chatId = otherUid + "_" + currentUid`.
   - "Message" button: compute chatId → check if `chats/{chatId}` exists → create if
     not (with both uids in `participants`) → navigate to Chat Detail.
   - On sending a message, also (in the same action flow): increment
     `unreadCount_{recipientUid}` on the chat doc, update `lastMessage`/
     `lastMessageAt`, and create a `notifications/{recipientUid}/items` doc with
     `pushSent: false`.
6. **Notifications feed** — query `notifications/{uid}/items` order by `createdAt`
   desc. Push arrives within ~5 minutes via the GitHub Actions cron job once
   `fcmToken` is saved on the user doc.
7. **Admin pages** (role-gated on `isAdmin == true`, redirect if false; deploy as
   FlutterFlow's responsive web build):
   - Dashboard: user count, post count, pending report count
   - Reports queue: list `reports` where `status == "pending"`, actions to hide a
     post (`posts/{id}.isHidden = true`) or ban a user (`users/{id}.isBanned = true`)
   - Users: search, toggle `isVerified` / `isBanned`

### Uploading images to Cloudinary (avatars, posts, chat images)

No Custom Code needed — use FlutterFlow's built-in **API Call** action wherever the
original spec says "upload to Storage":

- **Endpoint**: `POST https://api.cloudinary.com/v1_1/<your-cloud-name>/image/upload`
- **Body type**: multipart/form-data
- **Fields**: `file` (the picked image), `upload_preset` (your unsigned preset name)
- **Response**: parse the JSON response's `secure_url` field — that's the URL to
  store in `avatarUrl` / `imageUrls` / `imageUrl`.

Set this up once as a reusable **API Call** in FlutterFlow (Settings → API Calls),
then call it from Profile Setup (avatar), Create Post (multi-image), and Chat Detail
(image messages), each passing the picked file.

## 6. MVP scope decisions (locked in)

| Decision | MVP | Post-MVP |
|---|---|---|
| Student verification | `isVerified` set manually by admin toggle | NAU email or matric-number verification at signup |
| Username uniqueness | Client-side "create" against `usernames/{username}`, race-safe via Firestore's own create semantics | Cloud Function transaction (`functions-blaze-upgrade/`), once on Blaze |
| Unread counts / message notification | Client-side increment + notification write | Firestore trigger, once on Blaze |
| Push delivery | GitHub Actions cron every 5 min, direct FCM send | Instant Firestore trigger → FCM, once on Blaze |
| Image hosting | Cloudinary (unsigned upload preset, client-side) | Firebase Storage, once on Blaze (or keep Cloudinary — no strong reason to move) |
| Content moderation | User reports + manual admin review | Auto-moderation (image/text filtering) |
| Admin panel | Role-gated pages inside the main app | Separate FlutterFlow project, same backend |

## 7. Upgrading to Blaze later

When you're ready for instant push and transactional username claims: enable Blaze,
add `"functions": { "source": "functions-blaze-upgrade", "codebase": "default" }` back
into `firebase.json`, run `firebase deploy --only functions`, and disable the GitHub
Actions workflow (delete or comment out its `schedule:` trigger).

## 8. Post-MVP roadmap

Groups/communities, events board, marketplace, stories, anonymous confessions board,
search & discovery, block/mute, read receipts/typing indicators, multi-campus support
(`campusId` field), admin analytics dashboard.
