import assert from "node:assert/strict";
import test from "node:test";
import { completeDeliveryBody, needsDeadlineFollowup } from "../src/matter_intake.js";

test("a delivered signed document triggers follow-up inside fourteen days", () => {
  const deliveredAt = new Date("2026-10-01T09:00:00.000Z");
  const request = completeDeliveryBody.parse({
    matter_id: "MAT-2048",
    upload_id: "upload-123",
    object_key: "matters/MAT-2048/signed/consent.mp4",
    deadline_at: "2026-10-10T09:00:00.000Z",
    parts: [{ part_number: 1, etag: "etag-1" }]
  });

  assert.equal(needsDeadlineFollowup(request.deadline_at, deliveredAt), true);
});

test("a distant deadline remains out of the follow-up queue", () => {
  const deliveredAt = new Date("2026-10-01T09:00:00.000Z");
  assert.equal(needsDeadlineFollowup("2026-11-01T09:00:00.000Z", deliveredAt), false);
});
