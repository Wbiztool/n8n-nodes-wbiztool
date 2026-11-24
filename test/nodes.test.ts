import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import pkg from '../package.json';
import codex from '../nodes/WbizTool/WbizTool.node.json';
import { WbizToolApi } from '../credentials/WbizToolApi.credentials';
import {
	cleanCountryCode,
	isInternationalNumber,
	parseApiBody,
	readConnection,
	readMessageState,
	schedulePhone,
	toScheduleDate,
	toScheduleTime,
	WBIZTOOL_USER_AGENT,
} from '../nodes/WbizTool/GenericFunctions';
import { WbizTool } from '../nodes/WbizTool/WbizTool.node';
import { mockRun } from './helpers';

const node = new WbizTool();
const BASE = 'https://wbiztool.com/api/v1';
const TEXT = { messageType: '0', message: 'Hello', additionalOptions: {} };
const CREATED = { body: { status: 1, message: 'Created', msg_id: 9817263 } };

const message = (operation: string, params: IDataObject = {}) => ({
	resource: 'message',
	operation,
	...params,
});
const number = (operation: string, params: IDataObject = {}) => ({
	resource: 'whatsappNumber',
	operation,
	...params,
});

describe('package', () => {
	it('has no runtime dependencies (n8n verification)', () => {
		expect((pkg as { dependencies?: object }).dependencies ?? {}).toEqual({});
	});

	it('registers exactly one node, the WbizTool node', () => {
		expect(pkg.n8n.nodes).toEqual(['dist/nodes/WbizTool/WbizTool.node.js']);
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/WbizToolApi.credentials.js']);
	});

	it('is version 1.0.0 and sends it in the User-Agent', () => {
		expect(pkg.version).toBe('1.0.0');
		expect(WBIZTOOL_USER_AGENT).toBe(`n8n-nodes-wbiztool/${pkg.version}`);
		expect(new WbizToolApi().test.request.headers).toMatchObject({
			'User-Agent': WBIZTOOL_USER_AGENT,
		});
	});

	it('has a codex file for the node', () => {
		expect(codex.node).toBe(`${pkg.name}.${node.description.name}`);
		expect(codex.categories).toEqual(['Communication']);
	});
});

describe('node description', () => {
	const { description } = node;
	const operations = (resource: string) =>
		(
			description.properties.find(
				(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
			)?.options as INodePropertyOptions[]
		).map((o) => o.value);

	it('is one action node with the credential, usable as a tool', () => {
		expect(description.name).toBe('wbizTool');
		expect(description.version).toBe(1);
		expect(description.usableAsTool).toBe(true);
		expect(description.credentials).toEqual([{ name: 'wbizToolApi', required: true }]);
	});

	it('exposes every resource and operation', () => {
		const resources = (
			description.properties.find((p) => p.name === 'resource')?.options as INodePropertyOptions[]
		).map((o) => o.value);
		expect(resources).toEqual(['account', 'message', 'whatsappNumber']);
		expect(operations('message')).toEqual([
			'cancel',
			'getStatus',
			'schedule',
			'send',
			'sendToMany',
		]);
		expect(operations('whatsappNumber')).toEqual(['connect', 'getAll', 'getStatus']);
		expect(operations('account')).toEqual(['checkCredentials']);
	});

	it('gives every operation an action and every field a resource', () => {
		for (const prop of description.properties) {
			if (prop.name === 'operation') {
				for (const option of prop.options as INodePropertyOptions[]) {
					expect(option.action).toBeTruthy();
				}
			}
			if (prop.name !== 'resource') {
				expect(prop.displayOptions?.show?.resource).toBeDefined();
			}
		}
	});

	it('has an empty, optional Country Code', () => {
		const props = description.properties.filter((p: INodeProperties) => p.name === 'countryCode');
		expect(props.length).toBeGreaterThan(0);
		for (const prop of props) {
			expect(prop.default).toBe('');
			expect(prop.required).toBeFalsy();
		}
	});
});

describe('helpers', () => {
	it('converts schedule dates to DD/MM/YYYY', () => {
		expect(toScheduleDate('15/01/2024')).toBe('15/01/2024');
		expect(toScheduleDate('15-01-2024')).toBe('15/01/2024');
		expect(toScheduleDate('5.1.2024')).toBe('05/01/2024');
		expect(toScheduleDate('2024-01-15T10:30:00Z')).toBe('15/01/2024');
		expect(toScheduleDate('31/02/2026')).toBeNull();
		expect(toScheduleDate('tomorrow')).toBeNull();
	});

	it('converts schedule times to HH:MM', () => {
		expect(toScheduleTime('9:05')).toBe('09:05');
		expect(toScheduleTime('18:45:30')).toBe('18:45');
		expect(toScheduleTime('24:00')).toBeNull();
	});

	it('reads the JSON some endpoints send as text/html', () => {
		expect(parseApiBody('{"status": 1, "message": "okay"}')).toEqual({
			status: 1,
			message: 'okay',
		});
		expect(parseApiBody('<html>Not Found</html>')).toBeNull();
	});

	it('cleans country codes', () => {
		expect(cleanCountryCode('+44')).toBe('44');
		expect(cleanCountryCode('')).toBe('');
	});

	it('knows numbers written with + or 00 carry their country code', () => {
		expect(isInternationalNumber('+44 7700 900123')).toBe(true);
		expect(isInternationalNumber(' 0044 7700 900123')).toBe(true);
		expect(isInternationalNumber('07700 900123')).toBe(false);
		expect(isInternationalNumber('447700900123')).toBe(false);
		expect(schedulePhone('+44 (7700) 900-123')).toBe('+447700900123');
		expect(schedulePhone('0044 7700 900123')).toBe('00447700900123');
		expect(schedulePhone('12345')).toBeNull();
	});

	it('reads message states, not a success flag', () => {
		expect(
			readMessageState({ status: 0, message: 'Created', status_text: 'Created', error: '' }),
		).toEqual({ statusCode: 0, statusText: 'Created', deliveryStatus: 'queued' });
		expect(
			readMessageState({
				status: 0,
				message: 'Unknown message id',
				status_text: 'pending',
				error: 'Invalid message id',
			}),
		).toBeNull();
		expect(readMessageState({ status: 0, message: 'Auth Error' })).toBeNull();
	});

	it('does not read "Disconnected" or "not_connected_yet" as connected', () => {
		expect(readConnection({ status: 1, message: 'Connected' })).toBe(true);
		expect(readConnection({ status: 0, message: 'Disconnected' })).toBe(false);
		expect(readConnection({ status: 1, message: 'not_connected_yet' })).toBe(false);
		expect(readConnection({ status: 0, message: 'Auth Error 2' })).toBeNull();
	});
});

describe('requests', () => {
	it('go through the credential, form-encoded, with source and User-Agent', async () => {
		const { calls, run } = mockRun(
			node,
			message('send', {
				targetType: 'phone',
				phone: '919876543210',
				countryCode: '',
				whatsappClientId: 0,
				...TEXT,
			}),
			CREATED,
		);
		const [item] = await run();
		expect(item.messageId).toBe(9817263);
		expect(calls).toHaveLength(1);
		const { credentialType, options } = calls[0];
		expect(credentialType).toBe('wbizToolApi');
		expect(options.url).toBe(`${BASE}/send_msg/`);
		expect(options.method).toBe('POST');
		expect(options.headers).toMatchObject({
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': WBIZTOOL_USER_AGENT,
		});
		// client_id and api_key come from the credential's `authenticate`, not the node
		expect(options.body).toEqual({
			whatsapp_client: 678,
			msg_type: '0',
			msg: 'Hello',
			phone: '919876543210',
			source: 'n8n',
		});
	});

	it('turn an HTTP 400 answer into an error with the API message and a hint', async () => {
		const { run } = mockRun(node, message('cancel', { messageId: '12' }), {
			statusCode: 400,
			body: { status: 0, message: 'Auth Error: invalid api key' },
		});
		await expect(run()).rejects.toMatchObject({
			message: 'Auth Error: invalid api key',
			description: expect.stringContaining('Client ID and API Key'),
		});
	});

	it('give a success: false item with Continue On Fail', async () => {
		const { run } = mockRun(
			node,
			message('cancel', { messageId: '12' }),
			{ body: '{"status": 0, "message": "Msg_id cant be null"}' },
			{ continueOnFail: true },
		);
		expect(await run()).toEqual([{ success: false, error: 'Msg_id cant be null' }]);
	});

	it('refuse an unknown operation', async () => {
		const { run } = mockRun(node, { resource: 'message', operation: 'delete' }, CREATED);
		await expect(run()).rejects.toThrow("isn't supported");
	});
});

describe('Message › Send', () => {
	it('sends to a phone number with country code, expiry and webhook', async () => {
		const { calls, run } = mockRun(
			node,
			message('send', {
				targetType: 'phone',
				phone: '7700900123',
				countryCode: '+44',
				whatsappClientId: 99,
				messageType: '1',
				message: 'Look',
				imageUrl: 'https://example.com/a.jpg',
				additionalOptions: { expireAfterSeconds: 3600, webhookUrl: 'https://example.com/hook' },
			}),
			CREATED,
		);
		const [item] = await run();
		expect(calls[0].options.body).toEqual({
			whatsapp_client: 99,
			msg_type: '1',
			msg: 'Look',
			img_url: 'https://example.com/a.jpg',
			phone: '7700900123',
			country_code: '44',
			expire_after_seconds: 3600,
			webhook: 'https://example.com/hook',
			source: 'n8n',
		});
		expect(item).toMatchObject({
			success: true,
			messageId: 9817263,
			status: 1,
			message: 'Created',
		});
	});

	it('sends to a group on /send_msg/group/ (the old Send Group Message node)', async () => {
		const { calls, run } = mockRun(
			node,
			message('send', {
				targetType: 'group',
				groupName: 'Team',
				whatsappClientId: 0,
				messageType: '2',
				message: 'Invoice',
				fileUrl: 'https://example.com/i.pdf',
				fileName: 'i.pdf',
				additionalOptions: {},
			}),
			CREATED,
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/send_msg/group/`);
		expect(calls[0].options.body).toEqual({
			whatsapp_client: 678,
			msg_type: '2',
			msg: 'Invoice',
			file_url: 'https://example.com/i.pdf',
			file_name: 'i.pdf',
			group_name: 'Team',
			source: 'n8n',
		});
		expect(item.input).toMatchObject({ targetType: 'group', target: 'Team' });
	});

	it('refuses an empty image URL before calling the API', async () => {
		const { calls, run } = mockRun(
			node,
			message('send', {
				targetType: 'phone',
				phone: '1',
				countryCode: '',
				whatsappClientId: 0,
				messageType: '1',
				message: '',
				imageUrl: ' ',
				additionalOptions: {},
			}),
			CREATED,
		);
		await expect(run()).rejects.toThrow('Image URL is empty');
		expect(calls).toHaveLength(0);
	});
});

describe('Message › Send to Many', () => {
	it('sends one comma-separated string and outputs messageIds', async () => {
		const { calls, run } = mockRun(
			node,
			message('sendToMany', {
				phoneNumbers: '447700900123, 14155550123',
				countryCode: '',
				whatsappClientId: 0,
				...TEXT,
				additionalOptions: { webhookUrl: 'https://example.com/hook' },
			}),
			{ body: { status: 1, message: 'Successfully created 2 messages', msg_ids: [1, 2] } },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/send_msg/multi/`);
		expect(calls[0].options.body).toEqual({
			whatsapp_client: 678,
			msg_type: '0',
			msg: 'Hello',
			phone: '447700900123, 14155550123',
			webhook: 'https://example.com/hook',
			source: 'n8n',
		});
		expect(item.messageIds).toEqual([1, 2]);
		expect(item.statistics).toEqual({ totalRecipients: 2 });
	});

	it('sends a country code when set', async () => {
		const { calls, run } = mockRun(
			node,
			message('sendToMany', {
				phoneNumbers: '9876543210',
				countryCode: '91',
				whatsappClientId: 0,
				...TEXT,
			}),
			{ body: { status: 1, message: 'ok', msg_ids: [3] } },
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ country_code: '91' });
	});
});

describe('Message › Schedule', () => {
	const schedule = (params: IDataObject) =>
		message('schedule', {
			targetType: 'phone',
			countryCode: '',
			date: '2026-11-05',
			time: '9:30',
			timezone: 'CET',
			whatsappClientId: 0,
			...TEXT,
			...params,
		});
	const SCHEDULED = { body: { status: 1, message: 'Created', msg_id: 55 } };

	it('sends DD/MM/YYYY and HH:MM from the credential number', async () => {
		const { calls, run } = mockRun(node, schedule({ phone: '447700900123' }), SCHEDULED);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/schedule_msg/`);
		expect(calls[0].options.body).toEqual({
			whatsapp_client: 678,
			msg_type: '0',
			msg: 'Hello',
			date: '05/11/2026',
			time: '09:30',
			timezone: 'CET',
			phone: '447700900123',
			source: 'n8n',
		});
		expect(item.scheduledMessageId).toBe(55);
		expect(item.scheduling).toEqual({
			date: '05/11/2026',
			time: '09:30',
			timezone: 'CET',
			scheduledTime: '05/11/2026 09:30 CET',
		});
	});

	it('keeps the own country code of a number written with + (no country_code added)', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ phone: '+44 7700 900123', countryCode: '91' }),
			SCHEDULED,
		);
		const [item] = await run();
		expect(calls[0].options.body).toMatchObject({ phone: '+447700900123' });
		expect(calls[0].options.body).not.toHaveProperty('country_code');
		expect(item.input).toMatchObject({ target: '+447700900123', countryCode: null });
	});

	it('keeps the own country code of a number written with 00', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ phone: '0044 7700 900123', countryCode: '91' }),
			SCHEDULED,
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ phone: '00447700900123' });
		expect(calls[0].options.body).not.toHaveProperty('country_code');
	});

	it('sends the Country Code with a number written without it', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ phone: '7700 900123', countryCode: '+44' }),
			SCHEDULED,
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ phone: '7700900123', country_code: '44' });
	});

	it('schedules to a group', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ targetType: 'group', groupName: 'Team', date: '15-01-2027', time: '18:45:00' }),
			SCHEDULED,
		);
		await run();
		expect(calls[0].options.body).toMatchObject({
			group_name: 'Team',
			date: '15/01/2027',
			time: '18:45',
		});
		expect(calls[0].options.body).not.toHaveProperty('phone');
	});

	it('refuses an impossible date before calling the API', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ targetType: 'group', groupName: 'Team', date: '31/02/2026' }),
			SCHEDULED,
		);
		await expect(run()).rejects.toThrow('Date "31/02/2026"');
		expect(calls).toHaveLength(0);
	});

	it('refuses an invalid time before calling the API', async () => {
		const { calls, run } = mockRun(
			node,
			schedule({ phone: '447700900123', time: '25:00' }),
			SCHEDULED,
		);
		await expect(run()).rejects.toThrow('Time "25:00"');
		expect(calls).toHaveLength(0);
	});

	it('refuses a phone number that is too short', async () => {
		const { calls, run } = mockRun(node, schedule({ phone: '+1 234' }), SCHEDULED);
		await expect(run()).rejects.toThrow("isn't 6 to 15 digits long");
		expect(calls).toHaveLength(0);
	});
});

describe('Message › Cancel', () => {
	it('posts msg_id to /cancel_msg/', async () => {
		const { calls, run } = mockRun(node, message('cancel', { messageId: ' 9817263 ' }), {
			body: { status: 1, message: 'Message cancelled' },
		});
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/cancel_msg/`);
		expect(calls[0].options.body).toEqual({ msg_id: '9817263', source: 'n8n' });
		expect(item).toMatchObject({
			success: true,
			status: 1,
			message: 'Message cancelled',
			cancellation: { messageId: '9817263', statusText: 'Message cancelled' },
		});
	});
});

describe('Message › Get Status', () => {
	const states: Array<[number, string, string]> = [
		[0, 'Created', 'queued'],
		[1, 'Sent', 'delivered'],
		[2, 'Failed', 'failed'],
		[3, 'Cancelled', 'cancelled'],
		[4, 'Expired', 'expired'],
	];

	it.each(states)(
		'outputs state %i (%s) as an item',
		async (status, statusText, deliveryStatus) => {
			const error = status === 2 ? 'Invalid Contact Number' : '';
			const { calls, run } = mockRun(node, message('getStatus', { messageId: '9817263' }), {
				body: JSON.stringify({ message: statusText, status, status_text: statusText, error }),
			});
			const [item] = await run();
			expect(calls[0].options.url).toBe(`${BASE}/message/status/9817263/`);
			expect(item).toMatchObject({
				success: true,
				messageId: '9817263',
				status,
				statusText,
				error: error || null,
				deliveryStatus: { statusText, deliveryStatus, errorMessage: error || null },
			});
		},
	);

	it('stops on an unknown message id', async () => {
		const { run } = mockRun(node, message('getStatus', { messageId: '1' }), {
			body: {
				message: 'Unknown message id',
				status: 0,
				status_text: 'pending',
				error: 'Invalid message id',
			},
		});
		await expect(run()).rejects.toThrow('Invalid message id');
	});

	it('shows the credential hint on an auth answer', async () => {
		const { run } = mockRun(node, message('getStatus', { messageId: '1' }), {
			body: { message: 'Auth Error', status: 0 },
		});
		await expect(run()).rejects.toMatchObject({
			message: 'Auth Error',
			description: expect.stringContaining('Client ID and API Key'),
		});
	});

	it('refuses a message ID that is not a number', async () => {
		const { calls, run } = mockRun(node, message('getStatus', { messageId: 'abc' }), CREATED);
		await expect(run()).rejects.toThrow("isn't a number");
		expect(calls).toHaveLength(0);
	});
});

describe('WhatsApp Number › Get Many', () => {
	it('lists numbers from a text/html JSON answer', async () => {
		const clients = [
			{ id: 1, is_connected: true },
			{ id: 2, is_connected: false },
		];
		const { calls, run } = mockRun(node, number('getAll'), {
			body: JSON.stringify({ status: 1, message: 'okay', whatsapp_clients: clients }),
		});
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/whatsapp-client/list/`);
		expect(item).toMatchObject({ success: true, clientsCount: 2, clients });
		expect(item.summary).toMatchObject({
			totalClients: 2,
			connectedClients: 1,
			disconnectedClients: 1,
		});
	});
});

describe('WhatsApp Number › Connect', () => {
	it('posts the digits and the webhook', async () => {
		const { calls, run } = mockRun(
			node,
			number('connect', {
				whatsappNumber: '+91 (963) 206-6772',
				webhookUrl: ' https://example.com/qr ',
			}),
			{ body: { status: 1, message: 'created', whatsapp_client_id: 901 } },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/whatsapp-client/create/`);
		expect(calls[0].options.body).toEqual({
			whatsapp_number: '919632066772',
			webhook_url: 'https://example.com/qr',
			source: 'n8n',
		});
		expect(item).toMatchObject({
			whatsappClientId: 901,
			client: { whatsappClientId: 901, whatsappNumber: '919632066772', status: 'created' },
		});
	});

	it('refuses a short number before calling the API', async () => {
		const { calls, run } = mockRun(
			node,
			number('connect', { whatsappNumber: '12345', webhookUrl: '' }),
			CREATED,
		);
		await expect(run()).rejects.toThrow("isn't 10 to 15 digits");
		expect(calls).toHaveLength(0);
	});
});

describe('WhatsApp Number › Get Status', () => {
	it('Status by ID: not_connected_yet is not connected', async () => {
		const { calls, run } = mockRun(
			node,
			number('getStatus', { whatsappClientId: 678, checkMethod: 'byId' }),
			{ body: '{"message": "not_connected_yet", "status": 1}' },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/whatsapp/status/678/`);
		expect(item).toMatchObject({ isConnected: false, connectionStatus: 'disconnected' });
	});

	it('General Status: Disconnected (status 0) is an item, not an error', async () => {
		const { calls, run } = mockRun(
			node,
			number('getStatus', { whatsappClientId: 678, checkMethod: 'general' }),
			{ body: '{"message": "Disconnected", "status": 0}' },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/whatsapp-client/status/`);
		expect(calls[0].options.body).toEqual({ whatsapp_client: 678, source: 'n8n' });
		expect(item).toMatchObject({
			whatsappClientId: 678,
			isConnected: false,
			connectionStatus: 'disconnected',
			statusCheck: { isConnected: false, checkMethod: 'general' },
		});
	});

	it('Connected', async () => {
		const { run } = mockRun(
			node,
			number('getStatus', { whatsappClientId: 678, checkMethod: 'general' }),
			{ body: '{"message": "Connected", "status": 1}' },
		);
		const [item] = await run();
		expect(item).toMatchObject({ isConnected: true, connectionStatus: 'connected' });
	});

	it('an unknown number is an error, not "disconnected"', async () => {
		const { run } = mockRun(
			node,
			number('getStatus', { whatsappClientId: 5, checkMethod: 'byId' }),
			{ body: '{"message": "Unknown Whatsapp Client Id", "status": 0}' },
		);
		await expect(run()).rejects.toThrow('Unknown Whatsapp Client Id');
	});

	it('refuses an ID of 0 before calling the API', async () => {
		const { calls, run } = mockRun(
			node,
			number('getStatus', { whatsappClientId: 0, checkMethod: 'general' }),
			CREATED,
		);
		await expect(run()).rejects.toThrow('must be a positive number');
		expect(calls).toHaveLength(0);
	});
});

describe('Account › Check Credentials', () => {
	it('posts to /me/ and outputs the account', async () => {
		const { calls, run } = mockRun(
			node,
			{ resource: 'account', operation: 'checkCredentials', whatsappClientId: 0 },
			{ body: { status: 1, message: 'okay', name: 'Asha' } },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe(`${BASE}/me/`);
		expect(calls[0].options.body).toEqual({ source: 'n8n' });
		expect(item).toMatchObject({
			accountName: 'Asha',
			validation: { credentialsValid: true, clientId: 12345, whatsappClientId: null },
		});
	});

	it('also validates a WhatsApp number when set', async () => {
		const { calls, run } = mockRun(
			node,
			{ resource: 'account', operation: 'checkCredentials', whatsappClientId: 678 },
			{ body: { status: 1, message: 'okay', name: 'Asha' } },
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ whatsapp_client: 678 });
	});

	it('shows the WhatsApp number hint', async () => {
		const { run } = mockRun(
			node,
			{ resource: 'account', operation: 'checkCredentials', whatsappClientId: 5 },
			{ body: { status: 0, message: 'Invalid whatsapp client 5' } },
		);
		await expect(run()).rejects.toMatchObject({
			description: expect.stringContaining('ID of a WhatsApp number'),
		});
	});
});
