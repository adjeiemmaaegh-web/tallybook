# Round 1 store/device authorization contract — private server-only module
The server-only `createStoreDeviceAuthorizer` requires an independently verified
and unrevoked session principal plus an authoritative, fresh company membership,
active store and active device grant. Matching company/store/user/device,
device expiry and role are mandatory for every call. It does not use local
workspace IDs as proof and it has no browser-facing route. Current store-grant
database schema, admin issuer and live transactional adapter are NOT yet
implemented. Therefore this is a safe, inert service boundary, **not a usable
store finance authorization**. Staff store sale is not activated by this module;
sale services require their own server enforcement when built.

The grant issuer must validate owner/staff assignments and persist revocation,
and every money/stock transaction must invoke this check in the same trusted
database transaction as its write. Do not pass client-supplied `readBoundary`.
