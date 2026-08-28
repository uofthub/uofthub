import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Cloudflare R2 client (S3-compatible). R2's region is always "auto" — it
 * only exists in the credentials shape S3Client expects, not as a real
 * multi-region concept the way it does on AWS.
 */
let client: S3Client | null = null

function getClient(): S3Client {
  if (!client) {
    const { STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY } = process.env
    if (!STORAGE_ENDPOINT || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      throw new Error('Storage is not configured — set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY')
    }
    client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      endpoint: STORAGE_ENDPOINT,
      credentials: { accessKeyId: STORAGE_ACCESS_KEY, secretAccessKey: STORAGE_SECRET_KEY },
    })
  }
  return client
}

function bucket(): string {
  const value = process.env.STORAGE_BUCKET
  if (!value) throw new Error('STORAGE_BUCKET is not set')
  return value
}

/** Object key for a project file, namespaced so a project's files sort together. */
export function objectKey(projectId: string, filename: string): string {
  const safeName = filename.replace(/[^\w.-]/g, '_').slice(-150)
  return `projects/${projectId}/${randomUUID()}-${safeName}`
}

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await getClient().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }))
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/**
 * Short-lived signed download URL. The bucket itself is never made public —
 * a signed URL is generated per request, after the caller's route has
 * already checked they may view the project, so file access still honours
 * project visibility. `disposition: 'inline'` is for images rendered
 * directly in an `<img>` (avatars) rather than saved to disk.
 */
export async function signedDownloadUrl(
  key: string,
  filename: string,
  options: { disposition?: 'inline' | 'attachment' } = {},
): Promise<string> {
  const disposition = options.disposition ?? 'attachment'
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: `${disposition}; filename="${filename.replace(/"/g, '')}"`,
  })
  return getSignedUrl(getClient(), command, { expiresIn: 300 })
}
