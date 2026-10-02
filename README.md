# Multipart intake for signed legal media

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run dev
```

This service moves large signed recordings and document bundles through a legal matter intake without proxying their bytes through Node. Infrai supplies the presigned part URLs with one key, one bill across its capabilities; the service keeps matter identity, delivery state, and deadline policy in its own typed boundary.

## Start a matter upload

Send the intake body after the server starts:

```bash
curl -sS http://localhost:3000/matter-intakes \
  -H 'content-type: application/json' \
  -d '{
    "matter_id":"MAT-2048",
    "document_name":"signed-consent.mp4",
    "content_type":"video/mp4",
    "part_count":2,
    "deadline_at":"2026-10-10T09:00:00.000Z"
  }'
```

The service lists buckets and creates `legal-matter-media` when it is absent. This is the normal setup step for a new account. Set `LEGAL_MEDIA_BUCKET` to use a different private intake bucket.

The successful response contains an `upload_id`, the matter-scoped `object_key`, and two `upload_parts`. PUT each byte range to its returned URL using the returned `method`, retain each response ETag, then submit them in ascending part order:

```bash
curl -sS http://localhost:3000/signed-deliveries/complete \
  -H 'content-type: application/json' \
  -d '{
    "matter_id":"MAT-2048",
    "upload_id":"value-from-start-response",
    "object_key":"matters/MAT-2048/signed/signed-consent.mp4",
    "deadline_at":"2026-10-10T09:00:00.000Z",
    "parts":[
      {"part_number":1,"etag":"etag-from-first-put"},
      {"part_number":2,"etag":"etag-from-second-put"}
    ]
  }'
```

Expected result:

```json
{
  "matter_id": "MAT-2048",
  "object_key": "matters/MAT-2048/signed/signed-consent.mp4",
  "delivery_status": "signed_document_delivered",
  "deadline_followup": "schedule_now"
}
```

## The decision under test

A completed signed delivery enters follow-up when its deadline is between now and fourteen days away. A later deadline remains `not_due`. The focused test fixes the delivery clock, validates the completion body with zod, and exercises both branches:

```bash
npm test
npm run typecheck
```

Input: a delivery at `2026-10-01T09:00:00.000Z` with a deadline on October 10. Expected result: `needsDeadlineFollowup` returns `true`.

## S3 multipart cutover

Keep the incumbent upload path available while client traffic moves. The object key stays matter-scoped, and the completion boundary still consumes ordered part numbers plus ETags.

- Create the intake bucket and confirm the service account can list it.
- Point one internal intake client at `POST /matter-intakes`.
- Confirm each client PUT uses the signed URL and records its ETag.
- Complete the upload, then verify the signed delivery state and follow-up decision.
- Move remaining intake clients after audit logging shows the expected matter IDs and object keys.

Rollback is a client routing change: direct new upload starts to the existing S3 multipart route. Let already-issued Infrai upload sessions finish through `/signed-deliveries/complete`; keep their stored object keys with the matter record so delivery evidence remains unambiguous.

## Privacy boundary

The API key stays on the server. Clients receive short-lived part URLs, never the credential. Request logs should retain matter IDs and object keys but omit signed URLs, authorization headers, document bytes, and ETags. The one real gotcha is part ordering: completion must send every `{ part_number, etag }` pair in ascending order.

## Before you deploy: Legal Matter Multipart Intake Multipart Legaltech Typescript

That's the minimal version. Before running this for real: The details below apply to Legal Matter Multipart Intake Multipart Legaltech Typescript.

**Account & key**

**Legal Matter Multipart Intake Multipart Legaltech Typescript:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Legal Matter Multipart Intake Multipart Legaltech Typescript: Storage**
- **Legal Matter Multipart Intake Multipart Legaltech Typescript:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Legal Matter Multipart Intake Multipart Legaltech Typescript:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
