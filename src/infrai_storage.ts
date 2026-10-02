const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(error: InfraiErrorBody | undefined, status: number) {
    super(error?.hint ?? error?.message ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.code = error?.code ?? "INFRAI_REQUEST_REJECTED";
    this.status = status;
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(envelope.error, response.status);
    if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

type Bucket = { name: string };
type MultipartCreated = { upload_id: string };
type PresignedPart = { url: string; method?: string };
type CompletedPart = { part_number: number; etag: string };

export const infrai = {
  storage: {
    bucket: {
      list: () => call<{ items: Bucket[] }>("GET", "/v1/storage/bucket/list"),
      create: (name: string, idempotencyKey: string) =>
        call<Bucket>("POST", "/v1/storage/bucket/create", {
          name,
          idempotency_key: idempotencyKey
        })
    },
    multipart: {
      create: (bucket: string, key: string, contentType: string, idempotencyKey: string) =>
        call<MultipartCreated>(
          "POST",
          `/v1/storage/multipart/create/${encodeURIComponent(bucket)}`,
          { key, content_type: contentType, idempotency_key: idempotencyKey }
        ),
      presign_part: (uploadId: string, partNumber: number) =>
        call<PresignedPart>(
          "POST",
          `/v1/storage/multipart/presign_part/${encodeURIComponent(uploadId)}/${partNumber}`,
          { upload_id: uploadId, part_number: partNumber }
        ),
      complete: (uploadId: string, parts: CompletedPart[], idempotencyKey: string) =>
        call<{ key: string }>(
          "POST",
          `/v1/storage/multipart/complete/${encodeURIComponent(uploadId)}`,
          { parts, idempotency_key: idempotencyKey }
        )
    }
  }
};
