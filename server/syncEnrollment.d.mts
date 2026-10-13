export type EnrollmentRegistry = Readonly<{
  issueInvite(args: {orgId: string; administratorId: string; targetActorId: string}): Promise<Readonly<{token: string; expiresAt: number}>>;
  enroll(args: {orgId: string; actorId: string; deviceId: string; token: string}): Promise<Readonly<{orgId: string; actorId: string; deviceId: string; status: 'active'}>>;
  revoke(args: {orgId: string; administratorId: string; deviceId: string}): Promise<Readonly<{orgId: string; deviceId: string; status: 'revoked'}>>;
}>;
export function createServerEnrollmentRegistry(filename: string, clock?: () => number): EnrollmentRegistry;
