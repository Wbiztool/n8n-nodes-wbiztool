# Changelog

All notable changes to n8n-nodes-wbiztool are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-24

### Breaking: one WbizTool node replaces the ten nodes

n8n allows one regular node per community package, so the ten WbizTool nodes are now a single **WbizTool** node with
a Resource and an Operation field. Workflows built with 0.2.x keep running while n8n has 0.2.3 installed; after you
update to 1.0.0 their old WbizTool nodes show as unknown ("?") and need to be replaced. For each old node, add a
**WbizTool** node, pick the resource and operation below, enter the same values and reconnect it. The fields keep
their names and the output keeps its fields (`messageId`, `scheduledMessageId`, `messageIds`, `statusText`,
`isConnected` …), so expressions in later nodes keep working once the new node has the old node's name.

| Old node (0.2.x) | Resource | Operation |
| --- | --- | --- |
| WbizTool Send Message | Message | Send |
| WbizTool Send Group Message | Message | Send, Send To: Group |
| WbizTool Send Multi Message | Message | Send to Many (the field is now called Recipients) |
| WbizTool Schedule Message | Message | Schedule |
| WbizTool Cancel Message | Message | Cancel |
| WbizTool Message Status | Message | Get Status |
| WbizTool List WhatsApp Clients | WhatsApp Number | Get Many |
| WbizTool Create WhatsApp Client | WhatsApp Number | Connect |
| WbizTool WhatsApp Client Status | WhatsApp Number | Get Status |
| WbizTool Check Credentials | Account | Check Credentials |

The credential (WbizTool API) doesn't change. The node behaves like the old nodes' version 1.1: Country Code is
empty by default, Get Status outputs every message state, a disconnected number is an item with
`isConnected: false`. The version 1 behaviours (Country Code 91, stopping on a message that isn't sent or a
disconnected number) are gone.

### Fixed
- Schedule: a number written with + or 00 keeps its own country code, as Send already did. 0.2.x sent only the digits,
  so with a Country Code set, `+44 7700 900123` and Country Code 91 were scheduled to 91447700900123. Now the + is
  kept and no Country Code is added to numbers written with + or 00.
- Get Status (message) and Get Status (number) show the credential hint on an "Auth Error" answer too.

### Changed
- `input.target` of Send and Schedule is the phone number as sent; the Country Code is in `input.countryCode`
  (0.2.x put the two together, also where the API doesn't add the code).
- A codex file (`WbizTool.node.json`) puts the node in n8n's Communication category with a link to the guide.
- Placeholders and error descriptions follow n8n's UX guidelines.

## [0.2.3] - 2026-11-21

0.2.2 was tagged but never published (its User-Agent test failed); this version ships its change.

### Fixed
- Cancel Message, Check Credentials, Connect WhatsApp Number, List WhatsApp Numbers, Get Message Status and Get Number
  Status each have an Operation field with an action label, as n8n's community node check requires since November
  2026 (`resource-operation-pattern`). Nothing else changes: existing workflows keep working as before.

## [0.2.1] - 2026-11-06

### Fixed
- Package links use the repository's exact name, `Wbiztool/n8n-nodes-wbiztool`: npm refused the 0.2.0 provenance statement over the capital W, so 0.2.0 never reached npm. Everything listed under 0.2.0 ships in this version.

## [0.2.0] - 2026-10-18

Includes the unpublished 0.1.3 below. Existing workflows keep their node versions and behave as before, except for the
fixes marked "all versions".

### Fixed
- Send Group Message, Send Multi Message and Schedule Message (all versions): with WhatsApp Client ID left at 0 they
  sent `whatsapp_client=0`, so WbizTool answered "Invalid whatsapp client 0". They now use the credential's WhatsApp
  Client ID, as Send Message already did.
- WhatsApp Client Status (all versions): `isConnected` was true for "Disconnected" and "not_connected_yet" (it checked
  whether the message contained "connected"). Status by ID works again: the API endpoint was fixed on 2026-10-01.
- Message Status 1.1: every message state is an output item – `status` 0 Created (queued), 1 Sent, 2 Failed,
  3 Cancelled, 4 Expired, with `statusText`, `error` and `deliveryStatus` (queued / delivered / failed / cancelled /
  expired). Version 1 stopped with an error unless the message was Sent, and stays that way.
- WhatsApp Client Status 1.1: a disconnected number is an output item with `isConnected: false`; version 1 stopped
  with "Disconnected" (General Status) and stays that way.
- Send Message, Send Multi Message and Schedule Message 1.1: Country Code is optional and empty by default. Version 1
  defaulted to 91, which was put in front of every number that didn't start with 91 – also numbers written with their
  own country code, as the Phone Number field asks. Version 1 nodes keep 91.
- WbizTool's own messages (e.g. "Auth Error: invalid api key", answered with HTTP 400) are shown as the error, with a
  hint for the common ones, instead of a generic HTTP error. Answers sent as text/html are read as JSON.
- Message Status refuses a Message ID that isn't a number before calling the API (the URL needs a number).

### Changed
- Requests go through n8n's credential handling (`httpRequestWithAuthentication`); the WbizTool API credential adds
  `client_id` and `api_key`. A trailing slash in Base URL no longer breaks the URL.
- Built and linted with `@n8n/node-cli` (`n8n-node build` / `n8n-node lint`, n8n Cloud rules, strict mode); the npm
  package contains only `dist/`.
- Nodes and the credential show the WbizTool icon and can be used as AI agent tools (`usableAsTool`).
- `NodeConnectionTypes.Main` instead of the `NodeConnectionType` enum, which n8n-workflow 2 no longer has.
- Node groups are n8n's `output` (sending, cancelling, adding a number) and `input` (status, lists, credential check).
- Field descriptions say where to find each ID and what the webhook receives; README rewritten with credentials,
  every node, output, example workflows and node versions.
- Published from GitHub Actions with npm provenance (`.github/workflows/publish.yml`, on `v*.*.*` tags).

### Removed
- The unused runtime dependency `form-data`; the package has no runtime dependencies.
- Unused helpers (phone/message validators, rate-limit retry) and the gulp icon copy step.

### Added
- Unit tests (`npm test`, Jest) for the request format, the fixes above and the date/time conversion.
- Send Multi Message outputs `messageIds`.

## [0.1.3] - 2026-10-14 (not published to npm)

### Fixed
- Schedule Message: the date is sent as DD/MM/YYYY, the format the WbizTool API reads. Earlier versions asked for
  DD-MM-YYYY and sent it unchanged, so every scheduled message failed. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and ISO dates
  (2024-01-15, 2024-01-15T10:30:00Z) are accepted; times as H:MM, HH:MM or HH:MM:SS (sent as HH:MM). Impossible dates
  (31/02/2026) are refused before the request.

### Changed
- Every request (and the credential test) says it comes from this node: `source=n8n` in the body and the User-Agent
  `n8n-nodes-wbiztool/<version>`, so WbizTool can tell n8n calls apart. The API ignores `source`; nothing else changes.

## [0.1.2] - 2025-09-14

## [0.1.1] - 2025-07-21

## [0.1.0] - 2025-07-21

- First release: ten nodes (Send Message, Send Group Message, Send Multi Message, Schedule Message, Cancel Message,
  Message Status, Check Credentials, List WhatsApp Clients, Create WhatsApp Client, WhatsApp Client Status) and the
  WbizTool API credential.
