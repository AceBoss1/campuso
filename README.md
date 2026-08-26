# NAUZI — Campus Social App for NAU Students

MVP stack: **FlutterFlow** (client) + **Firebase** (backend). FlutterFlow itself is
built in its own web GUI, not in this repo — this repo holds everything Firebase-side
that needs to be version-controlled and deployed with the CLI: security rules,
indexes, and Cloud Functions.

## Repo layout

```
firebase.json           # Firebase CLI project config
.firebaserc              # points the CLI at your Firebase project
firestore.rules           # Firestore security rules
firestore.indexes.json    # composite indexes for the feed/chat/notification queries
storage.rules              # Storage rules for avatars/post/chat images
functions/                  # Cloud Functions (Node.js, v2 SDK)
  index.js
  package.json
```

## 1. One-time setup

```bash
npm install -g firebase-tools
firebase login
```

Create the Firebase project in the console (or `firebase projects:create`), then
enable in the console:
- **Authentication** → Phone provider
- **Firestore** → Native mode, `nam5` (or nearest region)
- **Storage**
- **Cloud Messaging**
- **Blaze plan** (required for Cloud Functions — the free Spark plan can't call out to FCM)

Set the project ID in `.firebaserc` (replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`).

## 2. Deploy the backend

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

This publishes:
- `firestore.rules` / `storage.rules`
- the composite indexes in `firestore.indexes.json`
- three Cloud Functions:
  - `claimUsername` — callable, transactionally reserves a unique lowercase username
  - `onMessageCreate` — Firestore trigger, updates `lastMessage`/`unreadCount_{uid}` and writes an in-app notification whenever a DM is sent
  - `sendPushOnNotificationCreate` — Firestore trigger, sends an FCM push whenever a `notifications/{uid}/items/{notifId}` doc is created

> Note: the security rules here tighten a couple of things versus a naive first draft —
> `usernames/{username}` is locked to server-only writes (only `claimUsername` can write
> it, via the Admin SDK), a `chats` document can only be created by one of its own
> participants, and posting/commenting/messaging is blocked once `isBanned == true`.

## 3. Firestore data model

See the full schema and index list you were given — it's implemented as-is in
`firestore.rules` / `firestore.indexes.json`. Quick summary:

- `users/{uid}`, `usernames/{username}` (reservation collection)
- `posts/{postId}` with `likes/{uid}` and `comments/{commentId}` subcollections
- `chats/{chatId}` (id = sorted `uid1_uid2`) with `messages/{messageId}` subcollection
- `reports/{reportId}`
- `notifications/{uid}/items/{notifId}`

## 4. FlutterFlow build order

Build the client in this order — each stage is independently testable:

1. **Connect Firebase** in FlutterFlow (Settings → Firebase → import the same project).
   Enable Phone Auth in FlutterFlow's Auth settings.
2. **Auth flow**: Splash → Phone Entry (+234 fixed prefix) → OTP Verify (FlutterFlow's
   built-in phone auth flow) → Profile Setup (name, username, department, level, avatar).
   - On Profile Setup, add a **Custom Action** calling the `claimUsername` callable
     function before letting the user continue. Show an inline "username taken" error
     on `already-exists`.
   - **Test on a real device** — reCAPTCHA for phone auth is flaky in FlutterFlow's
     in-browser test preview.
3. **Feed + Create Post + Post Detail** (core loop): Firestore query on `posts` where
   `isHidden == false`, order by `createdAt` desc, paginated. Create Post uploads
   images to `posts/{uid}/...` in Storage first, then writes the post doc.
4. **Profile (own/other) + Edit Profile**.
5. **Chat List + Chat Detail (DM)**:
   - Add the `getChatId` custom function (sort the two uids, join with `_`) so chat
     IDs are deterministic.
   - "Message" button: compute chatId → check if `chats/{chatId}` exists → create if
     not (with both uids in `participants`) → navigate to Chat Detail.
   - Do **not** increment unread counts or write notifications client-side — that's
     handled by `onMessageCreate` above.
6. **Notifications feed** — query `notifications/{uid}/items` order by `createdAt`
   desc. Push notifications arrive automatically once `fcmToken` is saved on the
   user doc and the Cloud Functions are deployed.
7. **Admin pages** (role-gated on `isAdmin == true`, redirect if false; deploy as
   FlutterFlow's responsive web build):
   - Dashboard: user count, post count, pending report count
   - Reports queue: list `reports` where `status == "pending"`, actions to hide a
     post (`posts/{id}.isHidden = true`) or ban a user (`users/{id}.isBanned = true`)
   - Users: search, toggle `isVerified` / `isBanned`

## 5. MVP scope decisions (locked in)

| Decision | MVP | Post-MVP |
|---|---|---|
| Student verification | `isVerified` set manually by admin toggle | NAU email or matric-number verification at signup |
| Username uniqueness | `usernames/{username}` transactional lookup via `claimUsername` | — permanent approach |
| Content moderation | User reports + manual admin review | Auto-moderation (image/text filtering) |
| Admin panel | Role-gated pages inside the main app | Separate FlutterFlow project, same backend |

## 6. Post-MVP roadmap

Groups/communities, events board, marketplace, stories, anonymous confessions board,
search & discovery, block/mute, read receipts/typing indicators, multi-campus support
(`campusId` field), admin analytics dashboard.
