import { randomUUID } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import type { Readable } from 'node:stream'

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
      throw new Error(
        'Storage is not configured — set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY'
      )
    }
    client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      endpoint: STORAGE_ENDPOINT,
      credentials: { accessKeyId: STORAGE_ACCESS_KEY, secretAccessKey: STORAGE_SECRET_KEY },
      // The local S3 mock in docker-compose serves buckets as paths
      // (localhost:9090/bucket); R2 accepts either, so this stays off unless a
      // local setup asks for it.
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
      // The SDK now adds CRC32 checksums to every upload by default, which R2
      // and the local S3 mock both reject on multipart uploads. Only when an
      // operation actually requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
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
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  )
}

/**
 * Stream an object of unknown length to storage — a multipart upload under
 * the hood — so a large video never has to sit in the API's memory whole. A
 * stream that errors part-way aborts the upload and leaves nothing behind.
 */
export async function putObjectStream(
  key: string,
  body: Readable,
  contentType: string
): Promise<void> {
  await new Upload({
    client: getClient(),
    params: { Bucket: bucket(), Key: key, Body: body, ContentType: contentType },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  }).done()
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/**
 * The first `maxBytes` of an object. Ranged rather than whole-object because
 * the text preview shows the head of a file and has no reason to pull 25MB
 * through the API to throw most of it away. A range past the end of a short
 * object just returns the object — which is how the profile preview card reads
 * a whole avatar, capped at the avatar size limit.
 */
export async function getObjectHead(key: string, maxBytes: number): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${maxBytes - 1}` })
  )
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Short-lived signed download URL. The bucket itself is never made public —
 * a signed URL is generated per request, after the caller's route has
 * already checked they may view the project, so file access still honours
 * project visibility. `disposition: 'inline'` is for images rendered
 * directly in an `<img>` (avatars) rather than saved to disk, and is only ever
 * used together with a `contentType` the browser cannot run as a page.
 */
export async function signedDownloadUrl(
  key: string,
  filename: string,
  options: { disposition?: 'inline' | 'attachment'; contentType?: string } = {}
): Promise<string> {
  const disposition = options.disposition ?? 'attachment'
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    // Quotes and anything outside printable ASCII stripped: the header must
    // stay one well-formed header whatever the student named the file.
    ResponseContentDisposition: `${disposition}; filename="${filename.replace(/[^\x20-\x7e]|"/g, '_')}"`,
    // Stated at signing time, so what the browser is told the bytes are never
    // depends on what an uploader once claimed about them.
    ...(options.contentType && { ResponseContentType: options.contentType }),
  })
  return getSignedUrl(getClient(), command, { expiresIn: 300 })
}
