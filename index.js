/**
 * upload-broker — presigns direct-to-R2 uploads so the R2 secret key never
 * touches the FlutterFlow client.
 *
 * Deploy with Wrangler (npm i -g wrangler; wrangler deploy) from this folder.
 * Requires wrangler.toml (see below) and these secrets set via:
 *   wrangler secret put R2_ACCESS_KEY_ID
 *   wrangler secret put R2_SECRET_ACCESS_KEY
 *
 * FlutterFlow calls POST /presign-upload with { fileName, contentType }
 * and gets back { uploadUrl, publicUrl } — it PUTs the file to uploadUrl,
 * then stores publicUrl in imageUrls / avatarUrl / proofUrls.
 */
import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const url = new URL(request.url);

    if (url.pathname === '/presign-upload') {
      const { fileName, contentType } = await request.json();
      if (!fileName || !contentType) {
        return json({ error: 'fileName and contentType are required' }, 400);
      }

      const key = `${crypto.randomUUID()}-${sanitize(fileName)}`;
      const client = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      });

      const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
      const signed = await client.sign(endpoint, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        aws: { signQuery: true },
      });

      return json({
        uploadUrl: signed.url,
        publicUrl: `${env.R2_PUBLIC_BASE_URL}/${key}`,
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
