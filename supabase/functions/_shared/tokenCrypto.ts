// Encrypt/decrypt social OAuth tokens at rest via the DB helpers
// (app_encrypt_secret / app_decrypt_secret), which use a Vault-held AES key.
// Only the service-role client may call these RPCs.
//
// Backward-compatible: app_decrypt_secret passes through legacy plaintext and
// the "demo_token" placeholder unchanged, so callers never special-case them.
// deno-lint-ignore-file no-explicit-any

/** Encrypt one token for storage. null/undefined -> null. */
export async function encryptToken(admin: any, plaintext: string | null | undefined): Promise<string | null> {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  const { data, error } = await admin.rpc("app_encrypt_secret", { p_plaintext: plaintext });
  if (error) throw new Error(`token encryption failed: ${error.message}`);
  return data as string;
}

/** Decrypt one stored token for use. null/undefined -> null. */
export async function decryptToken(admin: any, ciphertext: string | null | undefined): Promise<string | null> {
  if (ciphertext == null || ciphertext === "") return ciphertext ?? null;
  const { data, error } = await admin.rpc("app_decrypt_secret", { p_ciphertext: ciphertext });
  if (error) throw new Error(`token decryption failed: ${error.message}`);
  return data as string;
}

/**
 * Decrypt an `integrations.credentials` JSONB blob. Every string leaf was
 * encrypted individually by the encrypt_credentials trigger, so the object
 * comes back with the same keys and the same shape — callers keep indexing by
 * name (`credentials.secret_key`, `.apiKey`, `.webhookUrl`).
 *
 * Returns the value unchanged on null/empty. Legacy plaintext rows decrypt to
 * themselves (no 'v1:' prefix -> passthrough), so this is safe to call whether
 * or not the backfill has run.
 */
export async function decryptCredentials(admin: any, credentials: any): Promise<any> {
  if (credentials == null) return credentials;
  const { data, error } = await admin.rpc("app_decrypt_jsonb", { p_value: credentials });
  if (error) throw new Error(`credential decryption failed: ${error.message}`);
  return data;
}

/**
 * Decrypt the token columns of a list of social_accounts rows IN PLACE so every
 * downstream read (`acc.meta_page_access_token_encrypted`, etc.) is plaintext.
 * Best-effort per row: a decrypt failure on one account leaves its token as the
 * stored value rather than aborting the whole publish batch.
 */
export async function decryptAccountTokens(admin: any, accounts: any[] | null | undefined): Promise<void> {
  if (!accounts) return;
  for (const acc of accounts) {
    try {
      if (acc.meta_page_access_token_encrypted) {
        acc.meta_page_access_token_encrypted = await decryptToken(admin, acc.meta_page_access_token_encrypted);
      }
      if (acc.linkedin_access_token_encrypted) {
        acc.linkedin_access_token_encrypted = await decryptToken(admin, acc.linkedin_access_token_encrypted);
      }
    } catch (_e) {
      // Leave this account's token as-is; the publish call will surface a clear error.
    }
  }
}
