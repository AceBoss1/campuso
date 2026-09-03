# FlutterFlow Project Wizard prompt — Campuso v1

Paste into FlutterFlow's Project Wizard / "Generate with AI". Like the original NAUZI
prompt, this only generates a starting point — username claims, R2 uploads, Paystack
init, and confession/whistleblow submit flows still need to be wired by hand using
FlutterFlow's built-in Backend Call / API Call actions (no Custom Code, per the free-plan
constraint already established for this project).

---

```
App name: Campuso — Your Campus, Closer. The #1 campus social app for Nigerian
university students. Mobile-first, phone-number authentication.

Brand colors (from the delivered logo, NOT the original blue/navy spec — confirm
before final build if this is wrong): primary green #1E8449, accent gold/amber
#F5A623, white background, dark green text (#0F3D24) for headers.

DATA SCHEMA (Firestore, already deployed — match these collections exactly):

schools/{schoolId}
  name, shortName, emailDomain, colorAccent, isActive, memberCount, createdAt

users/{uid}
  uid, phone, fullName, username, department, level, avatarUrl, bio,
  schoolId, isVerified, verifiedBadgeType ("student_leader" | "lecturer" | "business" | null),
  isAdmin, isBanned, blockedUserIds, createdAt, lastActive, fcmToken

usernames/{username}
  uid, createdAt

schools/{schoolId}/posts/{postId}
  authorId, text, imageUrls, likeCount, commentCount, createdAt, isReported, isHidden
  schools/{schoolId}/posts/{postId}/likes/{uid}
  schools/{schoolId}/posts/{postId}/comments/{commentId}
  schools/{schoolId}/posts/{postId}/meta/boost   -- boosted, expiresAt (set by webhook only)

schools/{schoolId}/confessions/{confessionId}
  text, status ("pending"|"approved"|"rejected"), reactions { relate, cute, wild },
  createdAt, reviewedAt, reviewedBy
  -- NOTE: this doc has NO author field. The author link lives in a separate
  -- admin-only collection (schools/{schoolId}/confessionAuthors/{confessionId})
  -- that the student-facing app never reads. Displays publicly as "Campuso Anonymous".

schools/{schoolId}/whistleblows/{ticketId}
  anonTicketId, category, description, proofUrls, submittedByUid,
  status ("submitted"|"in_review"|"resolved"|"dismissed"), createdAt, updatedAt
  -- The submitting user can query their own tickets by submittedByUid to check
  -- status via anonTicketId. The Admin UI must show category/description/proof
  -- WITHOUT the submitter's name/username next to it.

chats/{chatId}
  participants, lastMessage, lastMessageAt, unreadCount_uid1, unreadCount_uid2
  chats/{chatId}/messages/{messageId}
    senderId, text, imageUrl, createdAt, isRead

reports/{reportId}
  reportedBy, targetType, targetId, reason, status, createdAt

notifications/{uid}/items/{notifId}
  type ("like"|"comment"|"message"|"system"|"confession_approved"|"announcement"),
  fromUserId, postId, text, isRead, pushSent, createdAt

announcements/{announcementId}
  title, body, schoolId ("all" or a specific schoolId), createdBy, createdAt

payments/{paymentId}
  uid, purpose ("boost_post"|"verified_business_badge"|"event_ticket"|"campuso_premium"),
  amount, status ("pending"|"success"|"failed"), paystackReference, createdAt
  -- `status` is set ONLY by the Paystack webhook worker, never by the client.

SCREENS TO GENERATE:

1. Splash — checks auth state, routes to Phone Entry or Feed.
2. Phone Entry — +234 fixed prefix, "Send Code".
3. OTP Verify — 6-digit input, "Verify".
4. Profile Setup — full name, username, School (dropdown from schools where
   isActive == true), department (dropdown), level (dropdown: 100L-500L, PG),
   avatar picker, bio. Username claim uses a "create at usernames/{username}"
   action per the existing race-safe pattern.
5. Feed (Home) — segmented control "All Schools" / "My School" (swaps between a
   collection-group query and a direct subcollection query), post cards (avatar,
   name + verified badge icon if verifiedBadgeType != null, text, images, like/
   comment counts, "Boosted" ribbon if meta/boost.boosted == true and not
   expired), FAB to Create Post, bottom nav (Feed, Confessions, Chats,
   Notifications, Profile).
6. Create Post — text field, multi-image picker (uploads via the R2 upload-broker
   API Call, not Cloudinary), "Boost this post (₦500–₦2000, 24hrs)" optional
   toggle that triggers a Paystack transaction init before posting.
7. Post Detail — full post, comments, comment input.
8. Confessions Feed — filtered to the user's school by default, toggle for "All
   Schools", cards show text + Relate/Cute/Wild reaction buttons, NO author
   info anywhere, header note "Posted as Campuso Anonymous".
9. Submit Confession — text field only (V1 is text-only, no images — flagged as
   a moderation-load decision, see docs/open-decisions.md), "Submit for Review"
   button, writes to confessions/{id} status=pending AND a separate write to
   confessionAuthors/{id} with the real uid.
10. Whistleblow Form — Category dropdown, Description text area, proof upload
    (via R2 broker, optional), "Submit" button generates an anonTicketId client-side
    and shows it prominently with "Save this ID to check your report status".
11. Whistleblow Status Check — enter/see anonTicketId, shows current status only
    (no admin replies visible here per the "no reply except via admin" rule —
    status changes are the only signal back to the reporter).
12. Profile (own/other) — avatar, name, verified badge, username, dept/level,
    bio, post grid, "Message" button (hidden on own profile), "Edit Profile".
13. Edit Profile.
14. Chat List / Chat Detail — as before, plus Block + Report actions.
15. Notifications — as before, plus "confession_approved" and "announcement" types.
16. Admin Dashboard — stat cards: users, posts, pending reports, pending
    confessions, open whistleblows, active boosts.
17. Admin — Manage Schools — add/edit school, toggle isActive, set emailDomain.
18. Admin — Reports Queue — hide post / ban user actions.
19. Admin — Confessions Queue — approve/reject pending confessions; approving
    reveals the linked confessionAuthors doc ONLY on this page, for moderation
    context, and triggers a "confession_approved" notification to that uid.
20. Admin — Whistleblows Queue — list by status, view proof, change status,
    NO reply field (per brief: no reply to user except via admin — i.e. admin
    contacts them out-of-band if needed, not through the app in V1).
21. Admin — Users — search, toggle Verified / Banned / verifiedBadgeType
    (student_leader / lecturer / business / none).
22. Admin — Announcements — compose, target one school or "all", send.

Design direction: clean, modern, avatar-forward campus social feel — rounded
cards, generous whitespace, green/gold accents from the Campuso logo on a white
base, similar in density to Instagram/Twitter feeds.
```
