/**
 * paystack-webhook — verifies Paystack's signature, then activates whatever
 * the payment was for (boosted post / verified business badge / premium)
 * by writing directly to Firestore with a service account — bypassing
 * client security rules entirely, which is why `payments/{id}` and
 * `.../boost` in firestore.rules have no client write path for `status`.
 *
 * Set up:
 *   1. In Paystack Dashboard -> Settings -> API Keys & Webhooks, set the
 *      webhook URL to this worker's URL + "/paystack-webhook", using your
 *      LIVE secret key's matching webhook (Paystack signs with your secret
 *      key, so this worker needs that same secret to verify).
 *   2. wrangler secret put PAYSTACK_SECRET_KEY
 *   3. wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON   (paste the full
 *      JSON key downloaded from Firebase Console -> Project Settings ->
 *      Service Accounts -> Generate new private key)
 *
 * DO NOT paste secret keys into chat, docs, or the FlutterFlow client —
 * only into `wrangler secret put`, which stores them encrypted on Cloudflare.
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    const expected = await hmacSha512Hex(env.PAYSTACK_SECRET_KEY, rawBody);
    if (signature !== expected) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(rawBody);
    if (event.event === 'charge.success') {
      const { reference, metadata, amount } = event.data;
      // `metadata` must be set when you initialize the Paystack transaction
      // from FlutterFlow, e.g.:
      //   { purpose: "boost_post", schoolId, postId, uid }
      //   { purpose: "verified_business_badge", uid }
      await activatePurchase(env, { reference, amount, ...metadata });
    }

    return new Response('ok', { status: 200 });
  },
};

async function activatePurchase(env, { purpose, schoolId, postId, uid, reference, amount }) {
  const token = await getFirestoreAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  if (purpose === 'boost_post') {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await patchDoc(`${base}/schools/${schoolId}/posts/${postId}/meta/boost`, token, {
      boosted: { booleanValue: true },
      expiresAt: { timestampValue: expiresAt },
      paystackRef: { stringValue: reference },
    });
  } else if (purpose === 'verified_business_badge') {
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await patchDoc(`${base}/users/${uid}`, token, {
      verifiedBadgeType: { stringValue: 'business' },
      isVerified: { booleanValue: true },
      badgeExpiresAt: { timestampValue: expiresAt },
    });
  }
  // TODO: "campuso_premium" purpose, event ticketing purchase confirmation, etc.
}

async function patchDoc(url, token, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  await fetch(`${url}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function hmacSha512Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Signs a Google service-account JWT and exchanges it for a short-lived
// OAuth2 access token, so this worker can write to Firestore with the
// same permissions as the Firebase Admin SDK.
async function getFirestoreAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${arrayBufferToBase64Url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await res.json();
  return access_token;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function arrayBufferToBase64Url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
