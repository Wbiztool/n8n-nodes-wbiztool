import pkg from '../package.json';
import { WbizToolApi } from '../credentials/WbizToolApi.credentials';
import {
	cleanCountryCode,
	parseApiBody,
	readConnection,
	readMessageState,
	toScheduleDate,
	toScheduleTime,
	WBIZTOOL_USER_AGENT,
} from '../nodes/WbizTool/GenericFunctions';
import { WbizToolCancelMessage } from '../nodes/WbizTool/WbizToolCancelMessage.node';
import { WbizToolListWhatsAppClients } from '../nodes/WbizTool/WbizToolListWhatsAppClients.node';
import { WbizToolMessageStatus } from '../nodes/WbizTool/WbizToolMessageStatus.node';
import { WbizToolScheduleMessage } from '../nodes/WbizTool/WbizToolScheduleMessage.node';
import { WbizToolSendGroupMessage } from '../nodes/WbizTool/WbizToolSendGroupMessage.node';
import { WbizToolSendMessage } from '../nodes/WbizTool/WbizToolSendMessage.node';
import { WbizToolSendMultiMessage } from '../nodes/WbizTool/WbizToolSendMultiMessage.node';
import { WbizToolWhatsAppClientStatus } from '../nodes/WbizTool/WbizToolWhatsAppClientStatus.node';
import { mockRun } from './helpers';

const TEXT = { messageType: '0', message: 'Hello', additionalOptions: {} };
const CREATED = { body: { status: 1, message: 'Created', msg_id: 9817263 } };

describe('package.json', () => {
	it('has no runtime dependencies (n8n verification)', () => {
		expect((pkg as { dependencies?: object }).dependencies ?? {}).toEqual({});
	});

	it('sends the package version in the User-Agent', () => {
		expect(WBIZTOOL_USER_AGENT).toBe(`n8n-nodes-wbiztool/${pkg.version}`);
		expect(new WbizToolApi().test.request.headers).toMatchObject({
			'User-Agent': WBIZTOOL_USER_AGENT,
		});
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

	it('reads message states, not a success flag', () => {
		expect(
			readMessageState({ status: 0, message: 'Created', status_text: 'Created', error: '' }),
		).toEqual({
			statusCode: 0,
			statusText: 'Created',
			deliveryStatus: 'queued',
		});
		expect(
			readMessageState({ status: 2, message: 'Failed', status_text: 'Failed' })?.deliveryStatus,
		).toBe('failed');
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
		expect(readConnection({ status: 1, message: 'connected' })).toBe(true);
		expect(readConnection({ status: 0, message: 'Disconnected' })).toBe(false);
		expect(readConnection({ status: 1, message: 'not_connected_yet' })).toBe(false);
		expect(readConnection({ status: 0, message: 'Auth Error 2' })).toBeNull();
	});
});

describe('requests', () => {
	it('goes through the credential, form-encoded, with source and User-Agent', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendMessage(),
			{ targetType: 'phone', phone: '919876543210', countryCode: '', whatsappClientId: 0, ...TEXT },
			CREATED,
		);
		const [item] = await run();
		expect(item.messageId).toBe(9817263);
		expect(calls).toHaveLength(1);
		const { credentialType, options } = calls[0];
		expect(credentialType).toBe('wbizToolApi');
		expect(options.url).toBe('https://wbiztool.com/api/v1/send_msg/');
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

	it('turns an HTTP 400 answer into an error with the API message', async () => {
		const { run } = mockRun(
			new WbizToolCancelMessage(),
			{ messageId: '12' },
			{ statusCode: 400, body: { status: 0, message: 'Auth Error: invalid api key' } },
		);
		await expect(run()).rejects.toThrow('Auth Error: invalid api key');
	});

	it('gives a success: false item with Continue On Fail', async () => {
		const { run } = mockRun(
			new WbizToolCancelMessage(),
			{ messageId: '12' },
			{ body: '{"status": 0, "message": "Msg_id cant be null"}' },
			{ continueOnFail: true },
		);
		expect(await run()).toEqual([{ success: false, error: 'Msg_id cant be null' }]);
	});

	it('lists clients from a text/html JSON answer', async () => {
		const { run } = mockRun(
			new WbizToolListWhatsAppClients(),
			{},
			{
				body: JSON.stringify({
					status: 1,
					message: 'okay',
					whatsapp_clients: [
						{ id: 1, is_connected: true },
						{ id: 2, is_connected: false },
					],
				}),
			},
		);
		const [item] = await run();
		expect(item.summary).toMatchObject({
			totalClients: 2,
			connectedClients: 1,
			disconnectedClients: 1,
		});
	});
});

describe('Country Code', () => {
	it('version 1 keeps sending its default 91', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendMessage(),
			{
				targetType: 'phone',
				phone: '9876543210',
				countryCode: '91',
				whatsappClientId: '',
				...TEXT,
			},
			CREATED,
			{ typeVersion: 1 },
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ phone: '9876543210', country_code: '91' });
	});

	it('version 1.1 defaults to empty and sends none', () => {
		const props = new WbizToolSendMessage().description.properties.filter(
			(p) => p.name === 'countryCode',
		);
		expect(props.map((p) => p.default)).toEqual(['91', '']);
		expect(props[1].required).toBeFalsy();
		expect(new WbizToolSendMessage().description.defaultVersion).toBe(1.1);
	});

	it('Send Multi Message 1.1 sends without a country code', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendMultiMessage(),
			{ phoneNumbers: '447700900123, 14155550123', countryCode: '', whatsappClientId: 0, ...TEXT },
			{ body: { status: 1, message: 'Successfully created 2 messages', msg_ids: [1, 2] } },
		);
		const [item] = await run();
		expect(item.messageIds).toEqual([1, 2]);
		expect(calls[0].options.body).not.toHaveProperty('country_code');
		expect(calls[0].options.body).toMatchObject({
			phone: '447700900123, 14155550123',
			whatsapp_client: 678,
		});
	});

	it('Send Multi Message 1 still asks for one', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendMultiMessage(),
			{ phoneNumbers: '9876543210', countryCode: '', whatsappClientId: 0, ...TEXT },
			CREATED,
			{ typeVersion: 1 },
		);
		await expect(run()).rejects.toThrow('Country Code is empty');
		expect(calls).toHaveLength(0);
	});
});

describe('WhatsApp Client ID', () => {
	// 0.1.x sent the field's 0 from Group, Multi and Schedule: "Invalid whatsapp client 0"
	it('falls back to the credential when the field is 0', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendGroupMessage(),
			{ groupName: 'Team', whatsappClientId: 0, ...TEXT },
			CREATED,
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ whatsapp_client: 678, group_name: 'Team' });
	});

	it('uses the field when set', async () => {
		const { calls, run } = mockRun(
			new WbizToolSendGroupMessage(),
			{ groupName: 'Team', whatsappClientId: 99, ...TEXT },
			CREATED,
		);
		await run();
		expect(calls[0].options.body).toMatchObject({ whatsapp_client: 99 });
	});
});

describe('Schedule Message', () => {
	it('sends DD/MM/YYYY and HH:MM from the credential number', async () => {
		const { calls, run } = mockRun(
			new WbizToolScheduleMessage(),
			{
				targetType: 'phone',
				phone: '+44 7700 900123',
				countryCode: '',
				date: '2026-11-05',
				time: '9:30',
				timezone: 'CET',
				whatsappClientId: 0,
				...TEXT,
			},
			{ body: { status: 1, message: 'Created', msg_id: 55 } },
		);
		const [item] = await run();
		expect(item.scheduledMessageId).toBe(55);
		expect(calls[0].options.url).toBe('https://wbiztool.com/api/v1/schedule_msg/');
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
	});

	it('refuses an impossible date before calling the API', async () => {
		const { calls, run } = mockRun(
			new WbizToolScheduleMessage(),
			{
				targetType: 'group',
				groupName: 'Team',
				date: '31/02/2026',
				time: '10:00',
				timezone: 'IST',
				whatsappClientId: 0,
				...TEXT,
			},
			CREATED,
		);
		await expect(run()).rejects.toThrow('Date "31/02/2026"');
		expect(calls).toHaveLength(0);
	});
});

describe('Message Status', () => {
	const queued = {
		body: '{"message": "Created", "status": 0, "status_text": "Created", "error": ""}',
	};

	it('1.1 outputs a queued message instead of failing', async () => {
		const { calls, run } = mockRun(new WbizToolMessageStatus(), { messageId: '9817263' }, queued);
		const [item] = await run();
		expect(calls[0].options.url).toBe('https://wbiztool.com/api/v1/message/status/9817263/');
		expect(item).toMatchObject({ success: true, status: 0, statusText: 'Created', error: null });
		expect(item.deliveryStatus).toMatchObject({ deliveryStatus: 'queued' });
	});

	it('1.1 outputs a failed message with its error', async () => {
		const { run } = mockRun(
			new WbizToolMessageStatus(),
			{ messageId: '7' },
			{
				body: {
					message: 'Failed',
					status: 2,
					status_text: 'Failed',
					error: 'Invalid Contact Number',
				},
			},
		);
		const [item] = await run();
		expect(item).toMatchObject({
			status: 2,
			statusText: 'Failed',
			error: 'Invalid Contact Number',
		});
	});

	it('keeps a sent message as "delivered" like 0.1.x', async () => {
		const { run } = mockRun(
			new WbizToolMessageStatus(),
			{ messageId: '7' },
			{
				body: { message: 'Sent', status: 1, status_text: 'Sent', error: '' },
			},
		);
		const [item] = await run();
		expect(item.deliveryStatus).toMatchObject({ deliveryStatus: 'delivered' });
	});

	it('version 1 still stops on a message that is not sent', async () => {
		const { run } = mockRun(new WbizToolMessageStatus(), { messageId: '9817263' }, queued, {
			typeVersion: 1,
		});
		await expect(run()).rejects.toThrow('Created');
	});

	it('stops on an unknown message id', async () => {
		const { run } = mockRun(
			new WbizToolMessageStatus(),
			{ messageId: '1' },
			{
				body: {
					message: 'Unknown message id',
					status: 0,
					status_text: 'pending',
					error: 'Invalid message id',
				},
			},
		);
		await expect(run()).rejects.toThrow('Invalid message id');
	});

	it('refuses a message ID that is not a number', async () => {
		const { calls, run } = mockRun(new WbizToolMessageStatus(), { messageId: 'abc' }, queued);
		await expect(run()).rejects.toThrow("isn't a number");
		expect(calls).toHaveLength(0);
	});
});

describe('WhatsApp Client Status', () => {
	it('Status by ID: not_connected_yet is not connected', async () => {
		const { calls, run } = mockRun(
			new WbizToolWhatsAppClientStatus(),
			{ whatsappClientId: 678, checkMethod: 'byId' },
			{ body: '{"message": "not_connected_yet", "status": 1}' },
			{ typeVersion: 1 },
		);
		const [item] = await run();
		expect(calls[0].options.url).toBe('https://wbiztool.com/api/v1/whatsapp/status/678/');
		expect(item).toMatchObject({ isConnected: false, connectionStatus: 'disconnected' });
	});

	it('General Status 1.1: Disconnected is an item', async () => {
		const { calls, run } = mockRun(
			new WbizToolWhatsAppClientStatus(),
			{ whatsappClientId: 678, checkMethod: 'general' },
			{ body: '{"message": "Disconnected", "status": 0}' },
		);
		const [item] = await run();
		expect(calls[0].options.body).toMatchObject({ whatsapp_client: 678 });
		expect(item).toMatchObject({ isConnected: false, connectionStatus: 'disconnected' });
	});

	it('General Status 1: Disconnected still stops the node', async () => {
		const { run } = mockRun(
			new WbizToolWhatsAppClientStatus(),
			{ whatsappClientId: 678, checkMethod: 'general' },
			{ body: '{"message": "Disconnected", "status": 0}' },
			{ typeVersion: 1 },
		);
		await expect(run()).rejects.toThrow('Disconnected');
	});

	it('Connected', async () => {
		const { run } = mockRun(
			new WbizToolWhatsAppClientStatus(),
			{ whatsappClientId: 678, checkMethod: 'general' },
			{ body: '{"message": "Connected", "status": 1}' },
		);
		const [item] = await run();
		expect(item).toMatchObject({ isConnected: true, connectionStatus: 'connected' });
	});

	it('an unknown number is an error, not "disconnected"', async () => {
		const { run } = mockRun(
			new WbizToolWhatsAppClientStatus(),
			{ whatsappClientId: 5, checkMethod: 'byId' },
			{ body: '{"message": "Unknown Whatsapp Client Id", "status": 0}' },
		);
		await expect(run()).rejects.toThrow('Unknown Whatsapp Client Id');
	});
});
