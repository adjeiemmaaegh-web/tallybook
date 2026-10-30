# Enrollment grant completion

The private device enrollment service previously consumed an owner invitation and stored the proven public key without issuing the grant required by the signed-pull authorization query. Successful key enrollment now creates an eight-hour active grant and its audit in the same transaction as invitation consumption and key insertion. Invalid signature verification occurs before any write. No browser authority or owner permission is relaxed.

Verification: UUID PGlite integration 2/2, including no grant after invalid proof and exact company/shop/user plus eight-hour lifetime after success. Existing enrollment service/coordinator/Postgres checks 19/19. These checks use isolated fixtures, not real Supabase accounts.

This changes the existing private server implementation. The QA Edge function still lacks the enrollment transport, and production remains disabled. Next implement the equivalent atomic service-role RPC and authenticated QA Edge bridge, retaining owner-only issuance, exact target membership, one-use proof, local staff/shop binding, revocation and bounded grants. Then connect the client enrollment UI and signed read before financial replay. No merge, deployment, or production-readiness claim follows from these checks.

Continuation: added an Edge WebCrypto enrollment-proof verifier matching the existing Node/browser byte contract. Interoperability check passes, including rejection of substituted company, account, shop, staff, device, token and signature. The verifier is not yet called by an HTTP route. Its caller must supply verified account and invitation scope; proof possession alone never authorizes enrollment. No remote configuration changed in this continuation.
