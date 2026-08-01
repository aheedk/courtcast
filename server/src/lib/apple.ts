import { env } from './env';

const APPLE_ISSUER = 'https://appleid.apple.com';

// The server is compiled as CommonJS, while jose v6 is ESM-only. TypeScript
// rewrites a regular `import('jose')` to `require('jose')` under the CommonJS
// module target, which crashes the production build before Express can boot.
// Constructing the native dynamic import keeps it intact in dist and lets
// CommonJS load jose's ESM entry point on demand.
type JoseModule = typeof import('jose');
const loadJose = new Function('return import("jose")') as () => Promise<JoseModule>;
let appleJwks: ReturnType<JoseModule['createRemoteJWKSet']> | null = null;

export interface AppleProfile {
  appleId: string;
  email: string | null;
  emailVerified: boolean;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleProfile> {
  const { createRemoteJWKSet, jwtVerify } = await loadJose();
  appleJwks ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

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
