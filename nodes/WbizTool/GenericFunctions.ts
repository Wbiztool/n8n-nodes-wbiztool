import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	JsonObject,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

/**
 * How WbizTool's analytics knows a call came from this node: `source` in the body (the API ignores it; Zapier and the
 * WordPress plugin send theirs the same way) and this User-Agent. Keep the version in step with package.json.
 */
export const WBIZTOOL_SOURCE = 'n8n';
export const WBIZTOOL_USER_AGENT = 'n8n-nodes-wbiztool/1.0.0';

export interface WbizToolRequestOptions {
	/**
	 * Return a `status: 0` answer instead of throwing. Message Status (status 0 = a queued message) and WhatsApp
	 * Client Status (status 0 + "Disconnected") use the field for a result, not only for a failed request.
	 */
	allowStatusZero?: boolean;
	itemIndex?: number;
}

/** The API's JSON answer from a body that may be a string (some endpoints answer JSON as text/html). */
export function parseApiBody(body: unknown): IDataObject | null {
	if (body && typeof body === 'object' && !Array.isArray(body)) return body as IDataObject;
	if (typeof body === 'string') {
		try {
			const parsed: unknown = JSON.parse(body);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? (parsed as IDataObject)
				: null;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * POST to the WbizTool API (v1). The body goes form-encoded – every endpoint reads form fields first – and the
 * credential adds `client_id` and `api_key` (WbizToolApi.authenticate). HTTP 4xx/5xx answers carry the API's own
 * message (e.g. "Auth Error: invalid api key"), so they are read like a 200 and turned into a NodeApiError with it.
 */
export async function wbizToolApiRequest(
	this: IExecuteFunctions,
	endpoint: string,
	body: IDataObject = {},
	options: WbizToolRequestOptions = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('wbizToolApi');
	const baseUrl = String(credentials.baseUrl ?? 'https://wbiztool.com/api/v1').replace(/\/+$/, '');

	const form: IDataObject = {};
	for (const [key, value] of Object.entries(body)) {
		if (value !== undefined && value !== null) form[key] = value;
	}
	if (form.source === undefined) form.source = WBIZTOOL_SOURCE;

	const request: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrl}${endpoint}`,
		body: form,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
			'User-Agent': WBIZTOOL_USER_AGENT,
		},
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	let response: { statusCode?: number; body?: unknown };
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'wbizToolApi',
			request,
		)) as { statusCode?: number; body?: unknown };
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			description: 'Check the Base URL in the WbizTool API credential and your network connection',
			itemIndex: options.itemIndex,
		});
	}

	const statusCode = Number(response.statusCode ?? 200);
	const data = parseApiBody(response.body);
	if (!data) {
		throw new NodeApiError(
			this.getNode(),
			{ body: String(response.body ?? '').slice(0, 500) },
			{
				message: `WbizTool answered with something other than JSON (HTTP ${statusCode})`,
				description: 'Check that the Base URL in the credential is https://wbiztool.com/api/v1',
				httpCode: String(statusCode),
				itemIndex: options.itemIndex,
			},
		);
	}

	const apiStatus = Number(data.status);
	if (statusCode >= 400 || (apiStatus === 0 && !options.allowStatusZero)) {
		throw new NodeApiError(this.getNode(), data as JsonObject, {
			message:
				typeof data.message === 'string' && data.message
					? data.message
					: `WbizTool answered HTTP ${statusCode}`,
			description: apiMessageHint(data.message),
			httpCode: String(statusCode),
			itemIndex: options.itemIndex,
		});
	}
	return data;
}

/** How to fix the API's common answers (the troubleshooting table of wbiztool.com/docs/n8n-integration/). */
export function apiMessageHint(message: unknown): string | undefined {
	const text = String(message ?? '');
	if (/^Auth Error|Invalid client id/i.test(text)) {
		return 'Check the Client ID and API Key in the WbizTool API credential (WbizTool → Settings → API keys)';
	}
	if (/^Invalid whatsapp client/i.test(text)) {
		return 'Use the ID of a WhatsApp number in this workspace, shown on WbizTool → WhatsApp settings';
	}
	if (/^Not enough credits/i.test(text)) {
		return 'The workspace has no messages left on the free plan';
	}
	return undefined;
}

/** The WhatsApp number to send from: the node's field, or the credential's when the field is empty or 0. */
export async function whatsAppClientId(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<number | string> {
	const value = this.getNodeParameter('whatsappClientId', itemIndex, '') as number | string;
	if (value !== '' && value !== null && value !== undefined && Number(value) !== 0) return value;
	const credentials = await this.getCredentials('wbizToolApi');
	return credentials.whatsappClientId as number;
}

/** Digits of a country code ('+91', ' 91 ' → '91'); '' when empty. */
export function cleanCountryCode(value: unknown): string {
	return String(value ?? '').replace(/\D/g, '');
}

/**
 * Runs `handler` for every input item. With "Continue On Fail" a failed item gives `{ success: false, error }`;
 * otherwise the node stops with a NodeApiError / NodeOperationError that names the item.
 */
export async function forEachItem(
	this: IExecuteFunctions,
	handler: (itemIndex: number) => Promise<IDataObject>,
): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];
	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		try {
			returnData.push({ json: await handler(itemIndex), pairedItem: { item: itemIndex } });
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { success: false, error: error instanceof Error ? error.message : String(error) },
					pairedItem: { item: itemIndex },
				});
				continue;
			}
			if (error instanceof NodeApiError) {
				error.context.itemIndex = itemIndex;
				throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
			}
			throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
		}
	}
	return [returnData];
}

/** A field that must not be blank (after trimming). */
export function requireText(
	this: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): string {
	const text = String(value ?? '').trim();
	if (!text) {
		throw new NodeOperationError(this.getNode(), `${label} is empty`, {
			description: `Enter a value for ${label} or map one from an earlier node`,
			itemIndex,
		});
	}
	return text;
}

/** `img_url` or `file_url` + `file_name` for Image (1) and File (2) messages. */
export function mediaFields(
	this: IExecuteFunctions,
	messageType: string,
	itemIndex: number,
): IDataObject {
	if (messageType === '1') {
		return {
			img_url: requireText.call(
				this,
				this.getNodeParameter('imageUrl', itemIndex),
				'Image URL',
				itemIndex,
			),
		};
	}
	if (messageType === '2') {
		return {
			file_url: requireText.call(
				this,
				this.getNodeParameter('fileUrl', itemIndex),
				'File URL',
				itemIndex,
			),
			file_name: requireText.call(
				this,
				this.getNodeParameter('fileName', itemIndex),
				'File Name',
				itemIndex,
			),
		};
	}
	return {};
}

/** ChatMsg.status as the message status endpoint returns it. */
export const MESSAGE_STATES: Record<number, { statusText: string; deliveryStatus: string }> = {
	0: { statusText: 'Created', deliveryStatus: 'queued' },
	// 'delivered' as 0.1.x output it for a sent message; WbizTool's "Sent" means WhatsApp took the message
	1: { statusText: 'Sent', deliveryStatus: 'delivered' },
	2: { statusText: 'Failed', deliveryStatus: 'failed' },
	3: { statusText: 'Cancelled', deliveryStatus: 'cancelled' },
	4: { statusText: 'Expired', deliveryStatus: 'expired' },
};

/**
 * The answer of /message/status/<id>/: `status` is the message's state (0 Created … 4 Expired), not a success flag,
 * and `status_text` its name. An unknown id answers status 0 with message "Unknown message id"; auth failures carry no
 * `status_text`. Returns the state, or null when the answer is not a message state.
 */
export function readMessageState(
	response: IDataObject,
): { statusCode: number; statusText: string; deliveryStatus: string } | null {
	if (response.status_text === undefined || response.message === 'Unknown message id') return null;
	const statusCode = Number(response.status);
	const known = MESSAGE_STATES[statusCode];
	if (!known) return null;
	return {
		statusCode,
		statusText: typeof response.status_text === 'string' ? response.status_text : known.statusText,
		deliveryStatus: known.deliveryStatus,
	};
}

/**
 * Connected or not, from /whatsapp-client/status/ ("Connected" status 1 / "Disconnected" status 0) or
 * /whatsapp/status/<id>/ ("connected" / "not_connected_yet", both status 1). Null for any other answer.
 * 0.1.x checked `message.includes('connected')`, which is true for "Disconnected" and "not_connected_yet" too.
 */
export function readConnection(response: IDataObject): boolean | null {
	const message = String(response.message ?? '').toLowerCase();
	if (message === 'connected') return true;
	if (message === 'disconnected' || message === 'not_connected_yet') return false;
	return null;
}

/**
 * The schedule API reads `date` as DD/MM/YYYY and `time` as HH:MM (24-hour). Accepts DD/MM/YYYY, DD-MM-YYYY (what
 * earlier versions of this node asked for), DD.MM.YYYY and n8n's ISO dates (2024-01-15, 2024-01-15T10:30:00Z – the
 * date part only) and returns DD/MM/YYYY, or null for anything else or an impossible date (31/02).
 */
export function toScheduleDate(input: string): string | null {
	const value = String(input ?? '').trim();
	let day: number, month: number, year: number;
	let m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
	if (m) {
		[day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
	} else if ((m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) {
		[year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	} else {
		return null;
	}
	const check = new Date(Date.UTC(year, month - 1, day));
	if (
		check.getUTCFullYear() !== year ||
		check.getUTCMonth() !== month - 1 ||
		check.getUTCDate() !== day
	)
		return null;
	return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** HH:MM for the schedule API from H:MM, HH:MM or HH:MM:SS (24-hour), or null. */
export function toScheduleTime(input: string): string | null {
	const m = String(input ?? '')
		.trim()
		.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
	return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/**
 * Whether a phone number is written with its own country code: a leading + or 00, as the WbizTool API reads it
 * (parse_number_cell → `international`). The API then doesn't add `country_code` in front of it.
 */
export function isInternationalNumber(value: unknown): boolean {
	return /^\s*(\+|00)/.test(String(value ?? ''));
}

/**
 * The Phone Number of Schedule as the API gets it: spaces, dashes, dots and brackets removed, a leading + kept (0.2.x
 * sent the digits only, so a '+44…' number with a Country Code set got that code added again). Null when it doesn't
 * have 6 to 15 digits.
 */
export function schedulePhone(value: string): string | null {
	const digits = value.replace(/\D/g, '');
	if (digits.length < 6 || digits.length > 15) return null;
	return value.trim().startsWith('+') ? `+${digits}` : digits;
}
