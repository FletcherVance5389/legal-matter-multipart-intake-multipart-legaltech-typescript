import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_storage.js";
import { completeSignedDelivery, startMatterIntake } from "./matter_intake.js";

const port = Number(process.env.PORT ?? 3000);

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    const body = await readBody(request);
    if (request.method === "POST" && request.url === "/matter-intakes") {
      return json(response, 201, await startMatterIntake(body));
    }
    if (request.method === "POST" && request.url === "/signed-deliveries/complete") {
      return json(response, 200, await completeSignedDelivery(body));
    }
    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(response, 400, { error: "invalid_request", issues: error.issues });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    return json(response, 500, { error: "request_failed" });
  }
}).listen(port, () => {
  console.log(`Matter intake service listening on http://localhost:${port}`);
});
