# n8n-nodes-wbiztool

[n8n](https://n8n.io) community node for [WbizTool](https://wbiztool.com): send WhatsApp messages, images and files
from your own WhatsApp number to people and groups, schedule them, and check or cancel them, from your n8n workflows.

Full guide: [wbiztool.com/docs/n8n-integration/](https://wbiztool.com/docs/n8n-integration/) ·
API reference: [wbiztool.com/docs/](https://wbiztool.com/docs/)

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter `n8n-nodes-wbiztool` and confirm. See n8n's
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

On a self-hosted instance you can also run `npm install n8n-nodes-wbiztool` in your n8n nodes folder
(`~/.n8n/nodes`, create it if it doesn't exist) and restart n8n.

## Credentials

You need a WbizTool account with a connected WhatsApp number. Create a credential of type **WbizTool API**:

| Field | Where to find it |
| --- | --- |
| **Client ID** | WbizTool → [Settings → API keys](https://wbiztool.com/settings/?tab=api-keys) |
| **API Key** | Same page |
| **WhatsApp Client ID** | WbizTool → [WhatsApp settings](https://wbiztool.com/whatsapp-settings/): the ID of the number to send from by default. The Message operations can override it. |
| **Base URL** | Keep `https://wbiztool.com/api/v1` |

The Client ID and API key are sent in the body of every request (`client_id`, `api_key`), as the
[WbizTool API](https://wbiztool.com/docs/#authentication) expects. When you save the credential, n8n tests it
against [Check credentials](https://wbiztool.com/docs/check-my-creds-api/).

## The WbizTool node

One node, **WbizTool**, with a **Resource** and an **Operation**:

| Resource | Operation | What it does | API |
| --- | --- | --- | --- |
| **Message** | **Send** | Send a text, image or file to a phone number or a group | [send_msg](https://wbiztool.com/docs/send-message-api/), [send_msg/group](https://wbiztool.com/docs/send-message-to-group-api/) |
| | **Send to Many** | Send the same message to a comma-separated list of numbers or groups | [send_msg/multi](https://wbiztool.com/docs/send-msg-multi-api/) |
| | **Schedule** | Schedule a message for a date, time and timezone | [schedule_msg](https://wbiztool.com/docs/schedule-message-api/) |
| | **Cancel** | Cancel a queued or scheduled message by its ID | [cancel_msg](https://wbiztool.com/docs/cancel-message-api/) |
| | **Get Status** | Get a message's status: Created (queued), Sent, Failed, Cancelled or Expired | [message/status](https://wbiztool.com/docs/message-status-api/) |
| **WhatsApp Number** | **Get Many** | List the WhatsApp numbers in your workspace | [whatsapp-client/list](https://wbiztool.com/docs/whatsapp-client-list-api/) |
| | **Connect** | Add a WhatsApp number; the QR code to scan goes to your webhook URL | [whatsapp-client/create](https://wbiztool.com/docs/whatsapp-connect-api/) |
| | **Get Status** | Check whether a WhatsApp number is connected | [whatsapp-client/status](https://wbiztool.com/docs/whatsapp-client-status-api/) |
| **Account** | **Check Credentials** | Check that the Client ID and API key work (and, optionally, a WhatsApp Client ID) | [me](https://wbiztool.com/docs/check-my-creds-api/) |

### Message fields

- **Send To** (Send, Schedule): Phone Number or Group.
- **Phone Number**: the number with its country code, e.g. `919876543210` or `+44 7700 900123`.
- **Group Name**: the exact name of a WhatsApp group your number is in.
- **Recipients** (Send to Many): comma-separated numbers; entries with letters are sent as group names.
- **Country Code** (optional): added in front of numbers that don't already start with it. Numbers written with `+`
  or `00` keep their own country code. Leave it empty when your numbers include their country code.
- **Date**, **Time**, **Timezone** (Schedule): Date as DD/MM/YYYY (DD-MM-YYYY, DD.MM.YYYY and YYYY-MM-DD are
  converted), Time as HH:MM 24-hour, Timezone CET, EST, GMT, IST, PST or UTC (daylight saving time applied for EST,
  PST and CET). A date or time the node can't read stops the item before anything is sent.
- **Message Type**: Text, Image with Text (public image URL) or File with Text (public file URL and file name).
- **WhatsApp Client ID**: leave at 0 to send from the number in the credential.
- **Options**: **Webhook URL** – WbizTool posts `msg_id` and `status` (`SENT`, `FAILED`, `CANCELLED` or `EXPIRED`)
  to it once the message is sent or fails; **Expire After (Seconds)** (Send) – cancel the message if it isn't sent
  in time.
- **Message ID** (Cancel, Get Status): the `messageId` or `scheduledMessageId` of an earlier Send or Schedule.

### Output

Each input item gives one output item with the API answer in `response` plus:

| Operation | Main fields |
| --- | --- |
| Message › Send | `messageId`, `status`, `message`, `input` |
| Message › Send to Many | `messageIds` (one per recipient), `statistics.totalRecipients` |
| Message › Schedule | `scheduledMessageId`, `scheduling` (`date`, `time`, `timezone`, `scheduledTime`) |
| Message › Cancel | `status`, `message`, `cancellation` |
| Message › Get Status | `status` (0 Created, 1 Sent, 2 Failed, 3 Cancelled, 4 Expired), `statusText`, `error`, `deliveryStatus.deliveryStatus` (`queued`, `delivered`, `failed`, `cancelled`, `expired`) |
| WhatsApp Number › Get Many | `clients` (`id`, `whatsapp_client_number`, `is_connected`, `status` …), `clientsCount`, `summary` |
| WhatsApp Number › Connect | `whatsappClientId`, `client` |
| WhatsApp Number › Get Status | `isConnected`, `connectionStatus` (`connected` / `disconnected`), `statusCheck` |
| Account › Check Credentials | `accountName`, `validation.credentialsValid` |

```json
{
  "success": true,
  "messageId": 9817263,
  "status": 1,
  "message": "Created",
  "response": { "status": 1, "message": "Created", "msg_id": 9817263 }
}
```

If WbizTool refuses a request, the node stops with WbizTool's message (for example `Invalid whatsapp client 678: …`)
and a hint for the common ones. Turn on the node's **Continue On Fail** setting to get an item with `success: false`
and `error` instead.

### Use as an AI agent tool

The node can be used as a tool by n8n AI agents (for example "send this customer a WhatsApp message"). On
self-hosted n8n, community nodes are only offered as tools when n8n runs with
`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Example workflows

**Welcome a new lead**

1. **Webhook** node receives `{ "phone": "919876543210", "name": "Asha" }`.
2. **WbizTool** › Message › Send: Phone Number `{{ $json.phone }}`, Message Text
   `Hi {{ $json.name }}, thanks for signing up!`.
3. **IF** node: `{{ $json.success }}` is true → update your CRM.

**Remind a customer the day before an appointment**

1. **Google Sheets** (or any source) gives `phone`, `date` (`2026-11-05`) and `time` (`10:30`).
2. **WbizTool** › Message › Schedule: Date `{{ $json.date }}`, Time `{{ $json.time }}`, Timezone IST.
3. Keep `scheduledMessageId` if you may need **WbizTool** › Message › Cancel later.

**Check that a message went out**

1. **WbizTool** › Message › Send → **Wait** 5 minutes.
2. **WbizTool** › Message › Get Status with Message ID `{{ $json.messageId }}`.
3. **Switch** on `{{ $json.statusText }}`: `Sent`, `Created` (still queued, e.g. the phone is offline), `Failed`.

## Upgrading from 0.2.x

Version 1.0.0 replaces the ten WbizTool nodes of 0.2.x with the single WbizTool node, so the package meets n8n's verification guidelines for community
nodes (one regular node per package). Workflows keep running while n8n has 0.2.x installed. After updating, the old nodes show
as unknown: replace each with a **WbizTool** node, set the resource and operation from this table, enter the same
values and give it the old node's name so expressions in later nodes keep working. Most fields keep their names (renamed: Target Type → Send
To, Additional Options → Options, Phone Numbers of Send Multi Message → Recipients); output field names are
unchanged; `input.target` of Send and Schedule is the number as sent, with the Country Code in `input.countryCode`.

| Old node (0.2.x) | Resource | Operation |
| --- | --- | --- |
| WbizTool Send Message | Message | Send |
| WbizTool Send Group Message | Message | Send, Send To: Group |
| WbizTool Send Multi Message | Message | Send to Many |
| WbizTool Schedule Message | Message | Schedule |
| WbizTool Cancel Message | Message | Cancel |
| WbizTool Message Status | Message | Get Status |
| WbizTool List WhatsApp Clients | WhatsApp Number | Get Many |
| WbizTool Create WhatsApp Client | WhatsApp Number | Connect |
| WbizTool WhatsApp Client Status | WhatsApp Number | Get Status |
| WbizTool Check Credentials | Account | Check Credentials |

The new node works like the old nodes' version 1.1 (no Country Code default of 91, every message status and a
disconnected number as an output item).

## Compatibility

Built with [`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli) and tested with n8n 2.x. The package has no
runtime dependencies.

## Development

```bash
npm install
npm run lint     # n8n-node lint (n8n Cloud rules)
npm test         # unit tests in test/
npm run build    # n8n-node build → dist/
npm run dev      # n8n with this node, rebuilt on change (needs Docker or Podman)
```

Releases are published to npm with provenance by `.github/workflows/publish.yml` when a `v*.*.*` tag is pushed.

## Resources

- [WbizTool n8n guide](https://wbiztool.com/docs/n8n-integration/)
- [WbizTool API docs](https://wbiztool.com/docs/)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)
- Support: support@wbiztool.com

## License

[MIT](LICENSE)
