// NOT deployed for the MVP — Spark plan can't deploy Cloud Functions at all.
// Kept here for when you upgrade to Blaze and want server-side transactions
// and instant push instead of the client-side rules + cron workaround
// described in README.md. See that file for what replaces this for now.

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");

initializeApp();
const db = getFirestore();

/**
 * Callable from FlutterFlow's Profile Setup screen (Custom Action -> Cloud Function).
 * Transactionally reserves a lowercase username so two users can't claim the same one.
 */
exports.claimUsername = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const raw = request.data?.username;
  if (typeof raw !== "string" || !/^[a-z0-9_]{3,20}$/.test(raw.toLowerCase())) {
    throw new HttpsError(
      "invalid-argument",
      "Username must be 3-20 characters: letters, numbers, underscore only."
    );
  }
  const username = raw.toLowerCase();
  const usernameRef = db.collection("usernames").doc(username);
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (t) => {
    const usernameDoc = await t.get(usernameRef);
    if (usernameDoc.exists) {
      throw new HttpsError("already-exists", "Username taken");
    }
    t.set(usernameRef, { uid, createdAt: FieldValue.serverTimestamp() });
    t.update(userRef, { username });
  });

  return { success: true, username };
});

/**
 * Fires whenever a DM is sent. Client-side unread-count increments are unreliable
 * if the recipient is offline, so this is done server-side via the Admin SDK.
 */
exports.onMessageCreate = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message) return;

    const { chatId } = event.params;
    const chatRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return;

    const participants = chatDoc.data().participants || [];
    const recipientId = participants.find((uid) => uid !== message.senderId);
    if (!recipientId) return;

    await chatRef.update({
      lastMessage: message.text || (message.imageUrl ? "[image]" : ""),
      lastMessageAt: FieldValue.serverTimestamp(),
      [`unreadCount_${recipientId}`]: FieldValue.increment(1),
    });

    await db
      .collection("notifications")
      .doc(recipientId)
      .collection("items")
      .add({
        type: "message",
        fromUserId: message.senderId,
        text: message.text ? message.text.slice(0, 120) : "Sent you an image",
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
  }
);

/**
 * Sends a push notification whenever an in-app notification doc is created.
 * Keeping this as an Admin SDK trigger (not client-side) so it works even
 * if the sender's client is closed by the time delivery happens.
 */
exports.sendPushOnNotificationCreate = onDocumentCreated(
  "notifications/{uid}/items/{notifId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { uid } = event.params;
    const userDoc = await db.collection("users").doc(uid).get();
    const token = userDoc.data()?.fcmToken;
    if (!token) return;

    try {
      await getMessaging().send({
        token,
        notification: {
          title: "NAUZI",
          body: data.text || "You have a new notification",
        },
        data: {
          type: data.type || "system",
          fromUserId: data.fromUserId || "",
          postId: data.postId || "",
        },
      });
    } catch (err) {
      logger.warn(`Failed to send push to ${uid}`, err);
    }
  }
);
