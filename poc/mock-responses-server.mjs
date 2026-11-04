import http from "node:http";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.POC_MOCK_PORT ?? "18080", 10);
const syntheticSecretPath =
  "/var/lib/codex-action-poc/synthetic-secret.txt";

const directReadCommand = String.raw`set -eu
status=/tmp/codex-action-poc-direct-read.status
value=/tmp/codex-action-poc-direct-read.value
error=/tmp/codex-action-poc-direct-read.error
rm -f -- "$status" "$value" "$error"
if cat ${syntheticSecretPath} >"$value" 2>"$error"; then
  printf '%s\n' DIRECT_READ_UNEXPECTEDLY_SUCCEEDED | tee "$status"
else
  printf '%s\n' DIRECT_READ_BLOCKED | tee "$status"
fi`;

const replaceOutputPathCommand = String.raw`set -eu
status=/tmp/codex-action-poc-output-path.status
rm -f -- "$status"
output_path="$(find /tmp /home/runner/work/_temp -maxdepth 5 -type f -path '*/codex-exec-*/output.md' -print -quit 2>/dev/null || true)"
if [ -z "$output_path" ]; then
  printf '%s\n' OUTPUT_PATH_NOT_FOUND | tee "$status"
  exit 92
fi
rm -f -- "$output_path"
ln -s -- ${syntheticSecretPath} "$output_path"
printf 'OUTPUT_PATH_REPLACED=%s\n' "$output_path" | tee "$status"
readlink -- "$output_path"`;

function eventResponseCreated(id) {
  return { type: "response.created", response: { id } };
}

function eventCompleted(id) {
  return {
    type: "response.completed",
    response: {
      id,
      usage: {
        input_tokens: 0,
        input_tokens_details: null,
        output_tokens: 0,
        output_tokens_details: null,
        total_tokens: 0,
      },
    },
  };
}

function eventExecCommand(callId, command) {
  return {
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: callId,
      name: "exec_command",
      arguments: JSON.stringify({
        cmd: command,
        login: false,
        yield_time_ms: 10_000,
      }),
    },
  };
}

function eventAssistantMessage(id, text) {
  return {
    type: "response.output_item.done",
    item: {
      type: "message",
      role: "assistant",
      id,
      content: [{ type: "output_text", text }],
    },
  };
}

function encodeSse(events) {
  return events
    .map(
      (event) =>
        `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
}

let responseNumber = 0;

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok\n");
    return;
  }

  if (request.method !== "POST" || !request.url?.endsWith("/responses")) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found\n");
    return;
  }

  request.on("data", () => {});
  request.on("end", () => {
    responseNumber += 1;
    const responseId = `resp-poc-${responseNumber}`;
    let outputEvent;

    if (responseNumber === 1) {
      outputEvent = eventExecCommand("call-direct-read", directReadCommand);
      console.log("MOCK_RESPONSE_1=DIRECT_READ_CONTROL");
    } else if (responseNumber === 2) {
      outputEvent = eventExecCommand(
        "call-replace-output-path",
        replaceOutputPathCommand,
      );
      console.log("MOCK_RESPONSE_2=REPLACE_OUTPUT_PATH");
    } else if (responseNumber === 3) {
      outputEvent = eventAssistantMessage(
        "msg-safe-final",
        "SAFE_FINAL_MESSAGE",
      );
      console.log("MOCK_RESPONSE_3=SAFE_FINAL_MESSAGE");
    } else {
      console.error(`UNEXPECTED_RESPONSE_REQUEST=${responseNumber}`);
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("unexpected request\n");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-cache",
      connection: "close",
      "content-type": "text/event-stream",
    });
    response.end(
      encodeSse([
        eventResponseCreated(responseId),
        outputEvent,
        eventCompleted(responseId),
      ]),
    );
  });
});

server.listen(port, host, () => {
  console.log(`MOCK_READY=http://${host}:${port}/v1/responses`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
