# Stage 11 Public Verification Notes

The managed checkpoint version is `0198c684`. Historical public verification served an older shell because of stale service-worker/browser cache behavior; this was a hosting-preview issue rather than a source-code dependency.

The current dev server and production PWA preview both contain and validate the Stage 11 implementation. The public verification session cleared only the published origin’s service-worker registrations and Cache Storage, then reloaded; the browser view subsequently reported `about:blank`, so the public route must be reopened and rechecked before the final owner handover is declared complete.

A second cache-busted public check and a direct version-manifest path still returned the “Stage 1 Publish Check” shell and no Stage 11 Companies workspace. The managed checkpoint tool reported deployment successful for version `0198c684`, but the named public domain has not reflected that build in this browser session. The owner-testable managed version attachment remains the reliable release reference; the public-domain mismatch is recorded as a deployment advisory and must not be described as a successful public-route verification.
