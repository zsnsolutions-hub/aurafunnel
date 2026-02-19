import { supabase } from './supabase';

/**
 * Upload a base64 data-URI image to Supabase Storage and return its public URL.
 */
export async function uploadBase64Image(dataUri: string): Promise<string> {
  // Parse the data URI
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URI');

  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType.split('/')[1]; // png, jpeg, webp, etc.

  // Decode base64 → Blob
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });

  // Get authenticated user
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Not authenticated');

  // Upload to Supabase Storage
  const path = `generated/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('image-gen-assets')
    .upload(path, blob, { upsert: true, contentType: mimeType });
  if (uploadErr) throw new Error(uploadErr.message || 'Image upload failed');

  // Return public URL
  const { data: urlData } = supabase.storage
    .from('image-gen-assets')
    .getPublicUrl(path);
  return urlData.publicUrl;
}
