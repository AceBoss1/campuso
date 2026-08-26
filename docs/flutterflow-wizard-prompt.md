# FlutterFlow Project Wizard prompt — NAUZI

Paste the block below into FlutterFlow's Project Wizard / "Generate with AI" for the
`nauzi-254ea` project. It only generates a starting point — you'll still wire up the
specific logic (username claim, chat id, Cloudinary calls) by hand per README.md
section 5, since the wizard can't set those up on its own.

---

```
App name: NAUZI — The #1 campus social chatting app for Nnamdi Azikiwe University
(NAU) students. Mobile-first, phone-number authentication, dark navy (#0B1F4D) and
crimson (#A6192E) brand colors on a white background.

DATA SCHEMA (Firestore, already deployed — match these collections exactly):

users/{uid}
  uid: string, phone: string, fullName: string, username: string, department: string,
  level: string, avatarUrl: string, bio: string, isVerified: bool, isAdmin: bool,
  isBanned: bool, createdAt: timestamp, lastActive: timestamp, fcmToken: string

usernames/{username}
  uid: string, createdAt: timestamp

posts/{postId}
  authorId: string, text: string, imageUrls: list<string>, likeCount: number,
  commentCount: number, createdAt: timestamp, isReported: bool, isHidden: bool

posts/{postId}/likes/{uid}
  createdAt: timestamp

posts/{postId}/comments/{commentId}
  authorId: string, text: string, createdAt: timestamp

chats/{chatId}
  participants: list<string>, lastMessage: string, lastMessageAt: timestamp,
  unreadCount_uid1: number, unreadCount_uid2: number (dynamic field names per uid)

chats/{chatId}/messages/{messageId}
  senderId: string, text: string, imageUrl: string, createdAt: timestamp, isRead: bool

reports/{reportId}
  reportedBy: string, targetType: string, targetId: string, reason: string,
  status: string, createdAt: timestamp

notifications/{uid}/items/{notifId}
  type: string, fromUserId: string, postId: string, text: string, isRead: bool,
  pushSent: bool, createdAt: timestamp

SCREENS TO GENERATE:

1. Splash — checks auth state, routes to Phone Entry or Feed.
2. Phone Entry — phone number field, +234 fixed country code prefix, "Send Code" button.
3. OTP Verify — 6-digit code input, "Verify" button.
4. Profile Setup — form: full name, username, department (dropdown), level (dropdown:
   100L-500L, PG), avatar picker, bio. "Continue" button.
5. Feed (Home) — scrollable list of posts (avatar, name, text, images, like count,
   comment count, timestamp), floating action button to Create Post, bottom nav bar
   (Feed, Chats, Notifications, Profile).
6. Create Post — multi-line text field, multi-image picker, "Post" button.
7. Post Detail — full post view, comment list, comment input field at bottom.
8. Profile (own/other) — avatar, name, username, department/level, bio, grid of the
   user's posts, "Message" button (hidden on own profile), "Edit Profile" button
   (only on own profile).
9. Edit Profile — form bound to the current user: bio, avatar, department, level.
10. Chat List — list of conversations: other user's avatar/name, last message preview,
    timestamp, unread badge.
11. Chat Detail — message bubbles (sent/received styling), text input with send
    button, image attach icon.
12. Notifications — list of activity items (icon by type, text, timestamp), tap to
    navigate to the related post or chat.
13. Admin Dashboard — responsive/web layout, three stat cards: total users, total
    posts, pending reports count.
14. Admin Reports — list of pending reports with reason and target preview, "Hide
    Post" and "Ban User" action buttons.
15. Admin Users — searchable user list, toggle switches for Verified and Banned.

Design direction: clean, modern campus social app feel — rounded cards, generous
whitespace, navy/crimson accent on a white base, avatar-forward layouts similar to
Instagram/Twitter feeds.
```
