# Campuso v1 — deployment runbook (dashboard-only, no CLI required)

Everything in `firestore.rules`, `firestore.indexes.json`, and `workers/` is
written and ready. Below is every platform this touches — Firebase, Cloudflare
(Workers + R2), Paystack, FlutterFlow, and Play Console — each done entirely
through its web dashboard. I don't have logins to any of these, so this is the
exact click path for whoever does.

---

## 0. GitHub — commit the new files, and don't skip the push-notification workflow

GitHub isn't optional here — it does two jobs in this stack, both still needed:

**a) Source of truth / handoff.** Push the files in this package into the repo
(`AceBoss1/nauzi`, or wherever the project has moved to under the Campuso name):
   - Replace `firestore.rules` and `firestore.indexes.json` with the versions here.
   - Add a top-level `workers/` folder with `upload-broker/` and `paystack-webhook/`.
   - Add the `docs/` files from this package.
   This is also the "GitHub codes" access the brief commits to handing over —
   it needs to actually reflect what's live, not just what's in Firebase/Cloudflare.

**b) Push notifications run *as* a GitHub Actions workflow — this predates this
session and is easy to lose track of because it's not in any of the Firebase/
Cloudflare/Paystack dashboards.** The repo already has
`.github/workflows/push-notifications.yml`, which polls Firestore every 5
minutes and sends pending notifications via FCM. Nothing about it changes for
v1 (confessions/whistleblow notification types still flow through the same
`notifications/{uid}/items` collection), but it needs its own one-time setup
if it isn't already running:
   1. Firebase Console → Project Settings → Service Accounts → **Generate new
      private key** (same kind of key used for the Paystack webhook in step 4
      below — you can reuse that same downloaded file, or generate a second one).
   2. GitHub repo → **Settings** → **Secrets and variables** → **Actions** →
      **New repository secret** → name it `FIREBASE_SERVICE_ACCOUNT_KEY` →
      paste the full JSON contents.
   3. Once that secret exists and the workflow file is on the default branch,
      it runs automatically every 5 minutes — no further action needed. You can
      also trigger it manually from the repo's **Actions** tab
      (`workflow_dispatch`) to confirm it's working before relying on it.

Everything below this is new for v1 and lives outside GitHub (Firebase console,
Cloudflare dashboard, Paystack dashboard) — but none of it replaces this step.

---

## 1. Firebase — deploy the security rules

1. Go to https://console.firebase.google.com → open the Campuso project.
2. Left sidebar → **Firestore Database** → **Rules** tab.
3. Open `firestore.rules` from this package, select all, copy it.
4. Paste it into the Rules editor in the console, replacing everything there.
5. Click **Publish**.

## 2. Firebase — add the indexes

Composite indexes can't be pasted as a block in the console — add each one from
`firestore.indexes.json` by hand:

1. Firestore Database → **Indexes** tab → **Create Index**.
2. For each entry in the file, set the Collection ID, add each field in the
   `fields` array with matching order (Ascending/Descending), and set
   **Query scope** to "Collection" or "Collection group" as marked in the file.
3. There are 7 indexes total in the file — repeat for each. They take a few
   minutes each to finish building; status shows as "Building" then "Enabled."

## 3. Firebase — seed the first school

1. Firestore Database → **Data** tab → **Start collection** → collection ID `schools`.
2. Document ID: `unizik` (or `nau` — confirm which schoolId you want first,
   since Profile Setup in the app will reference this exact ID).
3. Fields: `name` (string) "Nnamdi Azikiwe University", `shortName` (string)
   "UNIZIK", `emailDomain` (string) "unizik.edu.ng", `isActive` (boolean) true,
   `memberCount` (number) 0, `createdAt` (timestamp) — click the clock icon to
   set it to server time.
4. Save. Repeat for any other school you want live at launch.

## 4. Firebase — get the service account key (needed in step 6)

1. Project Settings (gear icon, top left) → **Service accounts** tab.
2. Click **Generate new private key** → confirm → a `.json` file downloads.
3. Keep this file somewhere private on your machine. You'll paste its full
   contents into a Cloudflare secret in step 6 — never into chat, a doc, or
   the FlutterFlow client.

---

## 5. Cloudflare — create the R2 bucket

1. Go to https://dash.cloudflare.com → log in (a card will be requested to
   activate R2 even on the free tier — you won't be charged unless you exceed
   10GB storage / 1M writes / 10M reads per month).
2. Left sidebar → **R2 Object Storage** → **Create bucket**.
3. Name it `campuso-media`, leave location as Automatic, create.
4. Bucket → **Settings** tab → note your **Account ID** (shown in the R2
   overview page URL or right sidebar) — you'll need it in step 7.
5. Still in bucket Settings → **Public access** → enable public access (or set
   up a custom domain) so uploaded images/proof files are viewable by URL.
   Note the public base URL it gives you (either an `r2.dev` URL or your
   custom domain) — you'll need this too.
6. Left sidebar → **R2** → **Manage R2 API Tokens** → **Create API Token**.
   Permissions: **Object Read & Write**, scope to the `campuso-media` bucket
   only. Save the **Access Key ID** and **Secret Access Key** shown — this is
   the only time the secret is shown in full.

## 6. Cloudflare — deploy the upload-broker Worker (no CLI)

1. Left sidebar → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `campuso-upload-broker` → **Deploy** (this creates a placeholder
   first — you'll overwrite the code next).
3. Click **Edit code** — this opens Cloudflare's browser-based code editor.
4. Delete the placeholder code. Open `workers/upload-broker/index.js` from
   this package, copy all of it, paste it in.
5. This Worker imports `aws4fetch` — in the editor's left panel, look for
   "npm packages" / dependencies (Cloudflare's Quick Edit supports adding npm
   packages directly); add `aws4fetch`. If your editor view doesn't show a
   package option, use the **Deploy via Wrangler** fallback note at the bottom
   of this doc instead — R2 presigning needs this dependency to work.
6. Click **Save and deploy**.
7. Go to the Worker's **Settings** → **Variables and Secrets**:
   - Add variable `R2_ACCOUNT_ID` = your Account ID from step 5.
   - Add variable `R2_BUCKET` = `campuso-media`.
   - Add variable `R2_PUBLIC_BASE_URL` = the public URL from step 5.
   - Add **secret** `R2_ACCESS_KEY_ID` = the Access Key ID from step 5.
   - Add **secret** `R2_SECRET_ACCESS_KEY` = the Secret Access Key from step 5.
8. Save. Note the Worker's URL, shown at the top of its page (something like
   `https://campuso-upload-broker.<your-subdomain>.workers.dev`) — this is
   what FlutterFlow's API Call will hit at `/presign-upload`.

## 7. Cloudflare — deploy the paystack-webhook Worker (no CLI)

Same pattern as step 6:
1. **Workers & Pages** → **Create Worker** → name it `campuso-paystack-webhook`.
2. **Edit code** → paste in `workers/paystack-webhook/index.js`.
3. **Save and deploy**.
4. **Settings** → **Variables and Secrets**:
   - Add **secret** `PAYSTACK_SECRET_KEY` = your Paystack secret key (test key
     for now — see step 8).
   - Add **secret** `FIREBASE_SERVICE_ACCOUNT_JSON` = paste the **entire
     contents** of the `.json` file downloaded in step 4.
5. Note this Worker's URL too — you'll paste it into Paystack next.

---

## 8. Paystack — connect the webhook

1. Go to https://dashboard.paystack.com → **Settings** → **API Keys & Webhooks**.
2. Under **Webhook URL**, paste the `campuso-paystack-webhook` Worker's URL
   from step 7.
3. Copy the **Test Secret Key** shown on this same page and use it as the
   `PAYSTACK_SECRET_KEY` secret in step 7 (Paystack signs webhook payloads
   with whichever secret key — test or live — matches the transaction, so
   the Worker's secret needs to match the mode you're testing in).
4. Stay on Test mode through Week 5 QA. Switch to Live keys (regenerate the
   webhook secret variable in the Worker) right before the Week 6 Play Store
   push.
5. Nobody needs to paste these keys anywhere except this dashboard field and
   the Cloudflare secret field above — not into chat, not into a doc, not into
   the FlutterFlow client.

---

## 9. FlutterFlow

1. Open the Campuso FlutterFlow project → **Project Wizard** → paste the code
   block from `docs/flutterflow-wizard-prompt-v1.md`.
2. **Settings** → **Firebase** → confirm it's connected to the same Firebase
   project the rules were published to in step 1.
3. Every image/proof upload action: use a **Backend Call / API Call** (built
   into FlutterFlow, no Custom Code) —
   - Call 1: `POST` to the upload-broker Worker URL + `/presign-upload`, body
     `{ "fileName": ..., "contentType": ... }`, returns `{ uploadUrl, publicUrl }`.
   - Call 2: `PUT` the picked file to `uploadUrl`.
   - Store `publicUrl` in the relevant field (`imageUrls`, `avatarUrl`,
     `proofUrls`).
4. For "Boost this post" / "Verified Business Badge" payments: the Paystack
   *initialize transaction* call needs your Paystack secret key server-side —
   add a third small Worker route (or a route on the existing webhook Worker)
   that holds the secret key and proxies that init call, so FlutterFlow never
   holds it directly.
5. Confirm whether OTP goes through Firebase's own SMS delivery or Termii once
   that account is handed over, before finalizing the Phone Entry/OTP screens.

## 10. Play Console

Standard FlutterFlow → app store export flow — unchanged by anything above.
Export the build, upload to the Play Console listing already created, follow
your existing release process for the Friday/Week 2/Week 4/Week 6 cadence.

---

## If the Cloudflare dashboard editor won't let you add `aws4fetch`

Some Workers dashboard views only support single-file, dependency-free code.
If that's what you're seeing, the CLI path is the fallback (needs Node.js
installed):

```bash
npm install -g wrangler
wrangler login
cd workers/upload-broker && npm install && wrangler deploy
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

Everything else (variables, the paystack-webhook worker, Firebase, Paystack)
stays exactly as described above either way.
