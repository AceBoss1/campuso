// Polls Firestore for unsent notification docs and pushes them via FCM directly.
// Run on a schedule (see .github/workflows/push-notifications.yml). This exists
// so push notifications work without deploying Cloud Functions, which require
// the Blaze plan — sending FCM messages from an external script does not.
//
// Requires notification docs to be created client-side with `pushSent: false`
// (see README.md). Docs missing an fcmToken are marked sent anyway so they
// aren't retried forever.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const BATCH_LIMIT = 200;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.");
  }
  return JSON.parse(raw);
}

async function main() {
  initializeApp({ credential: cert(loadServiceAccount()) });
  const db = getFirestore();
  const messaging = getMessaging();

  const snapshot = await db
    .collectionGroup("items")
    .where("pushSent", "==", false)
    .orderBy("createdAt", "asc")
    .limit(BATCH_LIMIT)
    .get();

  if (snapshot.empty) {
    console.log("No pending notifications.");
    return;
  }

  console.log(`Found ${snapshot.size} pending notification(s).`);

  const userCache = new Map();
  const getUser = async (uid) => {
    if (!userCache.has(uid)) {
      const doc = await db.collection("users").doc(uid).get();
      userCache.set(uid, doc.exists ? doc.data() : null);
    }
    return userCache.get(uid);
  };

  let sent = 0;
  let skipped = 0;

  await Promise.allSettled(
    snapshot.docs.map(async (doc) => {
      const notif = doc.data();
      const uid = doc.ref.parent.parent.id; // notifications/{uid}/items/{notifId}

      try {
        const user = await getUser(uid);
        const token = user?.fcmToken;

        if (token) {
          await messaging.send({
            token,
            notification: {
              title: "NAUZI",
              body: notif.text || "You have a new notification",
            },
            data: {
              type: notif.type || "system",
              fromUserId: notif.fromUserId || "",
              postId: notif.postId || "",
            },
          });
          sent += 1;
        } else {
          skipped += 1;
        }

        await doc.ref.update({ pushSent: true });
      } catch (err) {
        console.error(`Failed to process notification ${doc.ref.path}:`, err.message);
        // Leave pushSent unset so it's retried on the next run.
      }
    })
  );

  console.log(`Done. Sent: ${sent}, skipped (no token): ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
