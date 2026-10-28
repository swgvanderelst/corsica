# Google sign-in on iOS: the robust option (not implemented)

## What the app does now

- `signInWithPopup` on every platform, called straight from the tap on "Inloggen met Google" (popups are allowed when opened by a tap).
- `signInWithRedirect` only as a fallback when the popup is blocked (`auth/popup-blocked`).
- Every sign-in problem, from the popup or from `getRedirectResult` after a redirect, is shown as a Dutch toast (`authMsg` in `app.js`).

## Why a redirect can still fail

The app lives on `https://swgvanderelst.github.io/corsica/` but Firebase's default `authDomain` is `corsica-84e88.firebaseapp.com`.
`signInWithRedirect` hands the result back through storage that belongs to the `firebaseapp.com` origin. Safari (ITP, storage partitioning since iOS 16.1)
and Firefox block that cross-site storage, so after the redirect `getRedirectResult` returns nothing and the person looks signed out.
The popup flow uses `postMessage` between the popup and the page and does not depend on that storage, which is why it is the primary path.

## The robust option: serve the auth helper from the app's own origin

Firebase documents this as "use your own domain for `authDomain`" (see *Best practices for using signInWithRedirect on browsers that block third-party storage*).
With `authDomain` equal to the app's origin the redirect result is first-party storage and always works, also in a home-screen app.

1. **Authorized domain.** Firebase console, Authentication, Settings, Authorized domains: `swgvanderelst.github.io` is already there.
2. **Google OAuth redirect URI.** Google Cloud console (project `corsica-84e88`), APIs and Services, Credentials, the *Web client (auto created by Google Service)*:
   add `https://swgvanderelst.github.io/__/auth/handler` to *Authorized redirect URIs*, and `https://swgvanderelst.github.io` to *Authorized JavaScript origins*.
3. **Host the helper files on the same origin.** GitHub Pages cannot rewrite `/__/auth/*` to Firebase Hosting, so the helper has to exist as static files under that path.
   The helper pages are served by Firebase Hosting at `https://corsica-84e88.firebaseapp.com/__/auth/handler`, `/__/auth/handler.js`, `/__/auth/experiments.js` and `/__/auth/iframe`, `/__/auth/iframe.js`.
   Download them and commit them at the root of the Pages site, because `/__/auth/` must be reachable at `https://swgvanderelst.github.io/__/auth/...` (a user or organisation site root).
   The app currently lives under `/corsica/`: either publish the app from a user site `swgvanderelst.github.io` (repository `swgvanderelst.github.io`),
   or put the helper in that user site repository and keep the app as a project site.
   Note: the helper files are versioned by Firebase; refresh them when the SDK major version changes (they carry `firebaseConfig` values through the query string, nothing secret).
4. **Config.** In `firebase-config.js` set `authDomain: 'swgvanderelst.github.io'` (nothing else changes). Keep the pinned SDK version.
5. **Service worker.** `/__/auth/*` must never be served from the cache: it is outside this app's scope when the app is under `/corsica/`, and `sw.js` only handles requests in its own scope.
6. **Test.** `tools/firebase-smoke.mjs` cannot automate Google. Test on an iPhone in Safari and as a home-screen app: sign in, force-quit, open again, still signed in.

## Alternatives

- **Firebase Hosting for the app** (`https://corsica-84e88.web.app`): `authDomain` is then the same site and `/__/auth/*` is served automatically. The cost is moving off GitHub Pages.
- **A reverse proxy** that forwards `/__/auth/*` to `corsica-84e88.firebaseapp.com` (Cloudflare Worker or similar) on a custom domain.
- **Keep the popup** and accept that a blocked popup falls back to a redirect that may not complete on iOS; the toast then explains the failure.
