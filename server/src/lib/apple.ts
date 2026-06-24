import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface AppleProfile {
  appleId: string;
  email: string | null;
  emailVerified: boolean;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleProfile> {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: env.appleClientId,
  });

  if (!payload.sub) {
    throw new Error('Invalid Apple identity token payload');
  }

  const email = typeof payload.email === 'string' ? payload.email : null;
  const emailVerifiedClaim = payload.email_verified;
  const emailVerified = emailVerifiedClaim === true || emailVerifiedClaim === 'true';

  return {
    appleId: payload.sub,
    email,
    emailVerified,
  };
}
