# External agent extension

How an editor's "AI edit" action reaches an external agent, and where to
change the design. This file is the design of record for that seam. Update it
in the same change that moves a request field, a tool, an event, or an error
code.

The control service still does not call a model and does not hold a provider
key. See `docs/web-architecture.md` for the host, the file API, and save rules.

## 1. What is replaced

The desktop in-app agent is four layers:

| Layer            | Where                                                    | Role                                                                      |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `AgentLoop`      | `packages/agent-core`                                    | Runs the conversation: context, model turn, local tool, repeat            |
| `AgentSkill`     | each app, e.g. `apps/docs/src/renderer/ai/docs-skill.ts` | Prompt, tool list, `executeTool`                                          |
| `AgentTransport` | `packages/agent-core` + `packages/ai-provider`           | One model turn: `{ system, messages, tools }` in, text and tool calls out |
| `executeTool`    | `apps/docs/src/renderer/ai/tools.ts`                     | Applies an edit in the open editor                                        |

Three ways to swap the AI, and which one this tree uses:

| Level     | What changes                                                                                 | This tree                                                     |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Model     | Another provider behind `AgentTransport`                                                     | Already in desktop Settings. Not added here                   |
| Transport | An external assistant answers one turn; `AgentLoop` still runs                               | Not built. It would hide the assistant's own tools and memory |
| Agent     | `AiBackend` sends an agent request; the external agent runs its own loop and calls MCP tools | This is the web host                                          |

Edits from either path go through `executeTool`, so track changes, the
`aiChanged` highlight, and one-click rollback stay available. The in-app
guards (`verifyResponse`, the turn cap, the identical-turn check) do not run
for an external agent.

## 2. Request model

An agent request lives only in the control service's memory
(`packages/editor-control/src/requests.ts`).

```ts
kind: 'edit_selection' | 'queue_batch' | 'chat'
status: 'pending' | 'claimed' | 'done' | 'failed' | 'cancelled'
```

Status only moves forward: `pending → claimed → done|failed`, and
`pending|claimed → cancelled`. A cancel after `done` or `failed` does nothing.

Targets:

| Family | Shape                                                      |
| ------ | ---------------------------------------------------------- |
| docs   | `{ family: 'docs', anchorId, blocks: [start, end], text }` |
| slides | `{ family: 'slides', slide, elements, text? }`             |
| sheets | `{ family: 'sheets', sheet, range, text? }`                |
| pdf    | `{ family: 'pdf', page, text }`                            |

The editor anchors a docs selection before it submits, so a later
`replace_selection` edits that anchor rather than wherever the caret moved.
`expectedText` must still match the anchor or the editor returns
`selection_changed` and writes nothing.

A request is cancelled when the user cancels it, or when the editor unregisters
or its disconnect lease expires.

## 3. Subscriptions and callbacks

`subscribe_agent_requests` registers a sink. `genoffice serve` can also install
one at startup.

| Sink    | Shape                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| webhook | `{ type: 'webhook', url, secret? }` POST JSON. Header `X-GenOffice-Signature: sha256=<hmac>`. Retried (0 ms, 200 ms, 800 ms). At least once                   |
| command | `{ type: 'command', argv: string[] }` spawned with `shell: false`. `{requestId}` and `{mcpUrl}` are replaced. Env `GENOFFICE_MCP_URL`, `GENOFFICE_REQUEST_ID` |

`filter` may limit `families`, `paths`, and `kinds`. Webhook hosts must be
loopback (`127.0.0.1`, `localhost`, `::1`) unless the service was started with
`--allow-remote-callback`.

Events are `request.created` and `request.cancelled`. The body is the summary
only: `requestId`, `editorId`, `path`, `family`, `kind`, `instructionPreview`
(160 characters), `targetCount`. Document text is not in the callback. Call
`get_agent_request` for the selection, including a `<sel>…</sel>` span.

The first `claim_agent_request` wins. A later claim returns `request_claimed`.
`replace_selection`, `post_agent_message`, and `complete_agent_request` require
a claim.

`list_agent_requests` is the non-blocking inbox for an interactive session
("handle the edits I marked"). It does not wait.

When the subscription set changes, editors receive
`{ type: 'agents', count, labels }`. The docs "AI edit" entry stays disabled
while `count` is 0.

## 4. MCP tools

Names live in `LIVE_TOOL_NAMES` (`packages/editor-control/src/names.ts`).
Service tools are routed in `agent-tools.ts`. `read_selection` and
`replace_selection` are editor commands.

| Tool                         | Who runs it                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| `subscribe_agent_requests`   | service                                                                   |
| `list_agent_subscriptions`   | service                                                                   |
| `unsubscribe_agent_requests` | service                                                                   |
| `list_agent_requests`        | service                                                                   |
| `get_agent_request`          | service, then `read_selection` on the editor                              |
| `claim_agent_request`        | service                                                                   |
| `complete_agent_request`     | service; `status` is `done` or `failed`                                   |
| `post_agent_message`         | service; the editor shows `text`                                          |
| `read_selection`             | editor. `requestId` reads the anchor; omitted reads the live selection    |
| `replace_selection`          | editor. `html` is inline HTML. `persisted` is false until `save_document` |

`open_documents`, `read_document`, `read_pdf`, `document_status`, and
`save_document` stay the document tools from `docs/web-architecture.md`.
`insert_content`, `replace_blocks`, `apply_ops`, `apply_sheet_ops`, and
`apply_slide_ops` accept an optional `requestId`. A docs edit that carries one
keeps the run snapshot, follows the external track-changes switch, and leaves
the `aiChanged` highlight when tracking is off. A command without `requestId`
still auto-accepts, which is the previous MCP behaviour.

Stable errors (`LIVE_ERROR_REASONS`): `editor_disconnected`,
`unsaved_changes`, `revision_conflict`, `file_open_in_gui`, `file_not_found`,
`unsupported`, `invalid_argument`, `target_not_found`, `no_agent_subscribed`,
`request_not_found`, `request_cancelled`, `request_claimed`,
`selection_changed`.

## 5. Editor backend

`apps/docs/src/renderer/ai/backend.ts` defines `AiBackend`.

| Host    | `DocsAiPort`                     | Behaviour                                                          |
| ------- | -------------------------------- | ------------------------------------------------------------------ |
| Desktop | `{ kind: 'builtin' }`            | `createBuiltinBackend` opens the in-app panel and runs `AgentLoop` |
| Browser | `{ kind: 'external', requests }` | `createExternalBackend` submits over the editor WebSocket          |

WebSocket messages added on `/ws`:

| Direction        | Message                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| editor → service | `agent_request`, `agent_cancel`                                                                       |
| service → editor | `agent_event` (`accepted`, `rejected`, `claimed`, `message`, `done`, `failed`, `cancelled`), `agents` |

`ExternalAgentPanel` shows replies from `post_agent_message` and
`complete_agent_request`. The first mutating command for a `requestId` stores
a snapshot; the panel can roll that run back.

## 6. File map

| Change                    | Files                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Add or rename a live tool | `packages/editor-control/src/names.ts`, `dispatch.ts`, `agent-tools.ts` if it is service-routed, the editor command handler, this document |
| Add an error code         | `LIVE_ERROR_REASONS` in `requests.ts`, this document (a test fails if a name is missing)                                                   |
| Add a request field       | `requests.ts`, `callbackBody` if it is safe to put on the wire, this document                                                              |
| Add a document family     | an `AgentTarget` variant, the family's `host-web.ts` `onCommand`, and the row in section 7                                                 |
| Docs "AI edit" behaviour  | `AiAskPopover.tsx`, `App.tsx` `askSendNow`, `ai/backend.ts`, `mcp-bridge.ts`                                                               |
| Callback delivery         | `packages/control-service/src/agent-delivery.ts`, `server.ts`                                                                              |
| Port methods              | `packages/platform/src/ports/agent-control.ts`, `packages/platform-web/src/control-link.ts`                                                |

## 7. Family status

| Family | Agent request                                                                       | Write-back                                                                                                |
| ------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| docs   | "AI edit" and the external panel submit `edit_selection`, `queue_batch`, and `chat` | `replace_selection` uses the anchor and `executeTool`. Several blocks: `replace_blocks`                   |
| slides | Web host `agentControl.submitRequest` from "AI edit" when the port is set           | `apply_slide_ops` and `replace_selection` (`setText` on the target element)                               |
| pdf    | Command path only. The in-app panel stays desktop-only                              | `replace_selection` returns `unsupported` and tells the agent to add an annotation                        |
| sheets | Command path only                                                                   | `replace_selection` and `apply_sheet_ops` return `unsupported` until the wasm reactor can open a workbook |

## 8. Handling one request

1. `claim_agent_request`.
2. `get_agent_request` and read the `<sel>` span.
3. `replace_selection` with `requestId`, `html`, and `expectedText`. Use `replace_blocks` when the target spans more than one docs block.
4. `post_agent_message` for progress. `complete_agent_request` with `done` or `failed` and a short `summary`.
5. Leave `save_document` to the user unless they asked to save. `persisted: false` means the page changed and the file did not.
