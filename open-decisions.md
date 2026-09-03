# Open decisions before Friday's build starts

These aren't blockers to writing code — I've picked a default for each and built
the schema/rules above around it — but confirm or correct before the admin panel
and moderation flows go live, since two of them are hard to change after real
user data exists.

## 1. Brand colors: logo (green/gold) vs. brief text (blue/navy)
The delivered logo and wordmark are green (#1E8449-ish) and gold/amber
(#F5A623-ish). The written brief specifies `#2563EB → #0F172A` (blue → navy).
**Default applied: UI built around the logo's actual colors.** If the blue/navy
gradient was meant for something else (e.g. a secondary theme, dark mode), say so.

## 2. Confession anonymity: admin-traceable vs. truly unlinkable
The brief says "I will not link IP to uid... random anonId per post." Two ways
to honor that:
- **What's built (default):** the confession itself has no uid, so no other
  student can ever see who posted — but a separate admin-only collection
  (`confessionAuthors`) maps confessionId → uid, so admin can act on illegal
  content (threats, doxxing, exam-leak claims naming real people, CSAM, etc.)
  and has a defensible moderation trail if a school or law enforcement asks.
- **The stricter alternative:** never store the mapping at all, anywhere. Fully
  unlinkable, even to you. This is safer for whistleblower-style trust but means
  you have *no* way to ban a repeat abuser from confessions specifically (you'd
  have to ban their whole account only if you catch them another way), and no
  way to respond to a legal request for the author of a specific post.

Given the brief separately requires an admin moderation queue and a ban toggle,
I defaulted to the traceable version — flag if you want the stricter one instead.

## 3. Whistleblowing: same trade-off, opposite default risk
Here I kept the real `submittedByUid` on the ticket (admin can already see it —
just don't show it in the Admin UI). Reasoning: whistleblowing reports (exam
malpractice, harassment, corruption) are exactly the case where you may need to
follow up with the reporter, verify a claim, or protect against false/malicious
reports — full unlinkability removes your only lever for any of that. If you'd
rather have zero linkage even at the cost of not being able to verify claims,
say so and I'll rework the schema (likely: anonymous Firebase Auth session per
ticket, no link to the real account at all).

## 4. Confessions V1 scope: text-only
Matches your own recommendation in the brief — image confessions deferred to a
later version with AI blur / auto-approval. Already reflected in the schema
(no `imageUrls` field on confessions) and the FlutterFlow screen list.

## 5. Revenue features: what's real infrastructure vs. what's a placeholder
Built as real, working infrastructure now: boosted-post payment flow, verified
business badge payment flow, the Paystack webhook worker that activates both.
Built as placeholder-only (per your own "reserve slots" / "make UI ready"
framing, not full builds): AdMob banner slots, event ticketing module, Campuso
Premium paywall flags. Confirm this split matches what you want live at Week 6
vs. what should stay UI-only until V2.

## 6. Termii
Noted that Termii access is pending your email handoff in ~1 week. Nothing
above depends on Termii yet — flag if OTP delivery is meant to route through
Termii instead of Firebase's own phone-auth SMS, since that changes the Auth
screens' backend wiring, not just an account to add later.
