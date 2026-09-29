declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    QUESTION_HMAC_SECRET?: string;
    CC98_PINNED_JWKS?: string;
    CC98_JWKS_ADMIN_PUBLIC_KEY?: string;
  }
}
