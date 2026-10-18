# n8n-nodes-wbiztool

[n8n](https://n8n.io) community nodes for [WbizTool](https://wbiztool.com): send WhatsApp messages, images and files
from your own WhatsApp number to people and groups, schedule them, and check or cancel them, from your n8n workflows.

Full guide: [wbiztool.com/docs/n8n-integration/](https://wbiztool.com/docs/n8n-integration/) ·
API reference: [wbiztool.com/docs/](https://wbiztool.com/docs/)

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter `n8n-nodes-wbiztool` and confirm. See n8n's
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

On a self-hosted instance you can also run `npm install n8n-nodes-wbiztool` in your n8n custom nodes folder
(`~/.n8n/custom`) and restart n8n.

## Credentials

You need a WbizTool account with a connected WhatsApp number. Create a credential of type **WbizTool API**:

| Field | Where to find it |
| --- | --- |
| **Client ID** | WbizTool → [Settings → API keys](https://wbiztool.com/settings/?tab=api-keys) |
| **API Key** | Same page |
| **WhatsApp Client ID** | WbizTool → [WhatsApp settings](https://wbiztool.com/whatsapp-settings/): the ID of the number to send from by default. Sending nodes can override it. |
| **Base URL** | Keep `https://wbiztool.com/api/v1` |

The Client ID and API key are sent in the body of every request (`client_id`, `api_key`), as the
[WbizTool API](https://wbiztool.com/docs/#authentication) expects. When you save the credential, n8n tests it
against [Check credentials](https://wbiztool.com/docs/check-my-creds-api/).

## Nodes

| Node | What it does | API |
| --- | --- | --- |
| **WbizTool Send Message** | Send a text, image or file to a phone number or a group | [send_msg](https://wbiztool.com/docs/send-message-api/) |
| **WbizTool Send Group Message** | Send a message to a WhatsApp group by name | [send_msg/group](https://wbiztool.com/docs/send-message-to-group-api/) |
| **WbizTool Send Multi Message** | Send the same message to a comma-separated list of numbers or groups | [send_msg/multi](https://wbiztool.com/docs/send-msg-multi-api/) |
| **WbizTool Schedule Message** | Schedule a message for a date, time and timezone | [schedule_msg](https://wbiztool.com/docs/schedule-message-api/) |
| **WbizTool Cancel Message** | Cancel a queued or scheduled message by its ID | [cancel_msg](https://wbiztool.com/docs/cancel-message-api/) |
| **WbizTool Message Status** | Get a message's status: Created (queued), Sent, Failed, Cancelled or Expired | [message/status](https://wbiztool.com/docs/message-status-api/) |
| **WbizTool Check Credentials** | Check that the Client ID and API key work | [me](https://wbiztool.com/docs/check-my-creds-api/) |
| **WbizTool List WhatsApp Clients** | List the WhatsApp numbers in your workspace | [whatsapp-client/list](https://wbiztool.com/docs/whatsapp-client-list-api/) |
| **WbizTool Create WhatsApp Client** | Add a WhatsApp number; the QR code to scan goes to your webhook URL | [whatsapp-client/create](https://wbiztool.com/docs/whatsapp-connect-api/) |
| **WbizTool WhatsApp Client Status** | Check whether a WhatsApp number is connected | [whatsapp-client/status](https://wbiztool.com/docs/whatsapp-client-status-api/) |

All nodes can be used as tools by n8n AI agents (on self-hosted n8n, set
`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`).

### Common fields

- **Phone Number**: the number with its country code, e.g. `919876543210` or `+44 7700 900123`.
- **Country Code** (optional): added in front of numbers that don't already start with it. Leave it empty when your
  numbers include their country code.
- **Message Type**: Text, Image with Text (public image URL) or File with Text (public file URL and file name).
- **WhatsApp Client ID**: leave at 0 to send from the number in the credential.
- **Webhook URL** (option): WbizTool posts `msg_id` and `status` (`SENT`, `FAILED`, `CANCELLED` or `EXPIRED`) to it
  once the message is sent or fails.

### Output

Sending nodes output the API answer plus `messageId` (`scheduledMessageId` for Schedule Message, `messageIds` for Send
Multi Message), which you can pass to **Message Status** or **Cancel Message**:

```json
{
  "success": true,
  "messageId": 9817263,
  "status": 1,
  "message": "Created",
  "response": { "status": 1, "message": "Created", "msg_id": 9817263 }
}
```

If WbizTool refuses a request, the node stops with WbizTool's message (for example `Invalid whatsapp client 678: …`).
Turn on the node's **Continue On Fail** setting to get an item with `success: false` and `error` instead.

## Example workflows

**Welcome a new lead**

1. **Webhook** node receives `{ "phone": "919876543210", "name": "Asha" }`.
2. **WbizTool Send Message**: Phone Number `{{ $json.phone }}`, Message Text `Hi {{ $json.name }}, thanks for signing up!`.
3. **IF** node: `{{ $json.success }}` is true → update your CRM.

**Remind a customer the day before an appointment**

1. **Google Sheets** (or any source) gives `phone`, `date` (`2026-11-05`) and `time` (`10:30`).
2. **WbizTool Schedule Message**: Date `{{ $json.date }}` (DD/MM/YYYY, DD-MM-YYYY and YYYY-MM-DD all work), Time
   `{{ $json.time }}`, Timezone IST.
3. Keep `scheduledMessageId` if you may need **WbizTool Cancel Message** later.

**Check that a message went out**

1. **WbizTool Send Message** → **Wait** 5 minutes.
2. **WbizTool Message Status** with Message ID `{{ $json.messageId }}`.
3. **Switch** on `{{ $json.statusText }}`: `Sent`, `Created` (still queued, e.g. the phone is offline), `Failed`.

## Node versions

Send Message, Send Multi Message, Schedule Message, Message Status and WhatsApp Client Status have a version 1.1, which
new nodes use. Nodes already in your workflows stay on version 1 and keep working as before:

- Version 1 Country Code defaults to `91` (India); 1.1 has no default.
- Version 1 Message Status stops with an error unless the message is Sent; 1.1 outputs every status.
- Version 1 WhatsApp Client Status stops on a disconnected number (General Status); 1.1 outputs `isConnected: false`.

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
