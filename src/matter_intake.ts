import { z } from "zod";
import { infrai } from "./infrai_storage.js";

export const startIntakeBody = z.object({
  matter_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  document_name: z.string().min(1).max(180),
  content_type: z.string().min(1).max(120),
  part_count: z.number().int().min(1).max(10_000),
  deadline_at: z.string().datetime()
});

export const completeDeliveryBody = z.object({
  matter_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  upload_id: z.string().min(1),
  object_key: z.string().min(1),
  deadline_at: z.string().datetime(),
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().min(1)
  })).min(1)
});

export type CompleteDelivery = z.infer<typeof completeDeliveryBody>;

const BUCKET = process.env.LEGAL_MEDIA_BUCKET ?? "legal-matter-media";

export async function ensureMatterBucket(): Promise<void> {
  const { items } = await infrai.storage.bucket.list();
  if (!items.some((bucket) => bucket.name === BUCKET)) {
    await infrai.storage.bucket.create(BUCKET, `bucket:${BUCKET}`);
  }
}

export function needsDeadlineFollowup(deadlineAt: string, deliveredAt: Date): boolean {
  const remaining = Date.parse(deadlineAt) - deliveredAt.getTime();
  return remaining >= 0 && remaining <= 14 * 24 * 60 * 60 * 1_000;
}

export async function startMatterIntake(raw: unknown) {
  const input = startIntakeBody.parse(raw);
  await ensureMatterBucket();
  const safeName = input.document_name.replace(/[^A-Za-z0-9._-]/g, "_");
  const objectKey = `matters/${input.matter_id}/signed/${safeName}`;
  const idempotencyKey = `intake:${input.matter_id}:${safeName}`;
  const created = await infrai.storage.multipart.create(
    BUCKET,
    objectKey,
    input.content_type,
    idempotencyKey
  );
  const upload_parts = await Promise.all(
    Array.from({ length: input.part_count }, async (_, index) => {
      const part_number = index + 1;
      const signed = await infrai.storage.multipart.presign_part(created.upload_id, part_number);
      return { part_number, method: signed.method ?? "PUT", url: signed.url };
    })
  );
  return {
    matter_id: input.matter_id,
    upload_id: created.upload_id,
    object_key: objectKey,
    upload_parts,
    next: "upload_parts_then_complete"
  };
}

export async function completeSignedDelivery(raw: unknown, deliveredAt = new Date()) {
  const input = completeDeliveryBody.parse(raw);
  await infrai.storage.multipart.complete(
    input.upload_id,
    input.parts,
    `delivery:${input.matter_id}:${input.upload_id}`
  );
  const followup = needsDeadlineFollowup(input.deadline_at, deliveredAt);
  return {
    matter_id: input.matter_id,
    object_key: input.object_key,
    delivery_status: "signed_document_delivered" as const,
    deadline_followup: followup ? "schedule_now" as const : "not_due" as const
  };
}
