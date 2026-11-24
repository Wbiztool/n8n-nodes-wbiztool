import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import {
	apiMessageHint,
	cleanCountryCode,
	forEachItem,
	isInternationalNumber,
	mediaFields,
	readConnection,
	readMessageState,
	requireText,
	schedulePhone,
	toScheduleDate,
	toScheduleTime,
	whatsAppClientId,
	wbizToolApiRequest,
} from './GenericFunctions';

/** The Message operations that send something (and show the message fields). */
const SENDING = ['send', 'sendToMany', 'schedule'];

const webhookUrlOption: INodeProperties = {
	displayName: 'Webhook URL',
	name: 'webhookUrl',
	type: 'string',
	default: '',
	placeholder: 'e.g. https://example.com/wbiztool-callback',
	description:
		'WbizTool calls this URL with msg_id and status (SENT, FAILED, CANCELLED or EXPIRED) once the message is sent or fails',
};

const messageFields: INodeProperties[] = [
	// Send and Schedule: one phone number or one group
	{
		displayName: 'Send To',
		name: 'targetType',
		type: 'options',
		displayOptions: { show: { resource: ['message'], operation: ['send', 'schedule'] } },
		options: [
			{
				name: 'Phone Number',
				value: 'phone',
				description: 'A WhatsApp phone number',
			},
			{
				name: 'Group',
				value: 'group',
				description: 'A WhatsApp group your number is in',
			},
		],
		default: 'phone',
		description: 'Whether to send to a phone number or a group',
	},
	{
		displayName: 'Phone Number',
		name: 'phone',
		type: 'string',
		displayOptions: {
			show: { resource: ['message'], operation: ['send', 'schedule'], targetType: ['phone'] },
		},
		default: '',
		required: true,
		placeholder: 'e.g. +44 7700 900123',
		description:
			'WhatsApp phone number with its country code. A number written with + or 00 keeps its own country code.',
	},
	{
		displayName: 'Group Name',
		name: 'groupName',
		type: 'string',
		displayOptions: {
			show: { resource: ['message'], operation: ['send', 'schedule'], targetType: ['group'] },
		},
		default: '',
		required: true,
		placeholder: 'e.g. Team Updates',
		description: 'Exact name of a WhatsApp group your number is in',
	},
	// Send to Many
	{
		displayName: 'Recipients',
		name: 'phoneNumbers',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: ['sendToMany'] } },
		default: '',
		required: true,
		placeholder: 'e.g. 919876543210, +447700900123, Team Updates',
		description:
			'Comma-separated phone numbers with country code. Entries with letters are sent as group names.',
	},
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'string',
		displayOptions: {
			show: { resource: ['message'], operation: ['send', 'schedule'], targetType: ['phone'] },
		},
		default: '',
		placeholder: 'e.g. 44',
		description:
			"Country code without + (e.g. 44 for the UK, 1 for the USA), added in front of a number that doesn't already start with it and isn't written with + or 00. Leave empty when numbers include their country code.",
	},
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: ['sendToMany'] } },
		default: '',
		placeholder: 'e.g. 44',
		description:
			"Country code without + (e.g. 44 for the UK, 1 for the USA), added in front of numbers that don't already start with it and aren't written with + or 00. Leave empty when numbers include their country code.",
	},
	// Schedule
	{
		displayName: 'Date',
		name: 'date',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: ['schedule'] } },
		default: '',
		required: true,
		placeholder: 'e.g. 15/01/2027',
		description: 'Day to send the message: DD/MM/YYYY (DD-MM-YYYY and YYYY-MM-DD are converted)',
	},
	{
		displayName: 'Time',
		name: 'time',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: ['schedule'] } },
		default: '',
		required: true,
		placeholder: 'e.g. 10:30',
		description: 'Time to send the message, HH:MM (24-hour)',
	},
	{
		displayName: 'Timezone',
		name: 'timezone',
		type: 'options',
		displayOptions: { show: { resource: ['message'], operation: ['schedule'] } },
		options: [
			{ name: 'CET (Central European Time)', value: 'CET' },
			{ name: 'EST (Eastern Standard Time)', value: 'EST' },
			{ name: 'GMT (Greenwich Mean Time)', value: 'GMT' },
			{ name: 'IST (India Standard Time)', value: 'IST' },
			{ name: 'PST (Pacific Standard Time)', value: 'PST' },
			{ name: 'UTC (Coordinated Universal Time)', value: 'UTC' },
		],
		default: 'IST',
		description:
			'Timezone of the date and time; daylight saving time is applied for EST, PST and CET',
	},
	// What to send
	{
		displayName: 'Message Type',
		name: 'messageType',
		type: 'options',
		displayOptions: { show: { resource: ['message'], operation: SENDING } },
		options: [
			{ name: 'Text', value: '0', description: 'A text message' },
			{ name: 'Image with Text', value: '1', description: 'An image with a caption' },
			{
				name: 'File with Text',
				value: '2',
				description: 'A file (PDF, document …) with a caption',
			},
		],
		default: '0',
		description: 'What to send',
	},
	{
		displayName: 'Message Text',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 4 },
		displayOptions: { show: { resource: ['message'], operation: SENDING } },
		default: '',
		required: true,
		placeholder: 'e.g. Hi Asha, your order has shipped.',
		description: 'The message text (the caption of an image or file), up to 3,000 characters',
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: SENDING, messageType: ['1'] } },
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/image.jpg',
		description: 'Public URL of the image to send',
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: SENDING, messageType: ['2'] } },
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/invoice.pdf',
		description: 'Public URL of the file to send',
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: SENDING, messageType: ['2'] } },
		default: '',
		required: true,
		placeholder: 'e.g. invoice.pdf',
		description: 'File name the recipient sees',
	},
	{
		displayName: 'WhatsApp Client ID',
		name: 'whatsappClientId',
		type: 'number',
		displayOptions: { show: { resource: ['message'], operation: SENDING } },
		default: 0,
		description:
			'The WhatsApp number to send from, from WbizTool → WhatsApp settings. Leave at 0 to use the one in the credential.',
	},
	{
		displayName: 'Options',
		name: 'additionalOptions',
		type: 'collection',
		displayOptions: { show: { resource: ['message'], operation: ['send'] } },
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Expire After (Seconds)',
				name: 'expireAfterSeconds',
				type: 'number',
				default: 0,
				placeholder: 'e.g. 3600',
				description: 'Cancel the message if it is not sent within this many seconds (0: never)',
			},
			webhookUrlOption,
		],
	},
	{
		displayName: 'Options',
		name: 'additionalOptions',
		type: 'collection',
		displayOptions: { show: { resource: ['message'], operation: ['sendToMany', 'schedule'] } },
		placeholder: 'Add Option',
		default: {},
		options: [webhookUrlOption],
	},
	// Cancel and Get Status
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		displayOptions: { show: { resource: ['message'], operation: ['cancel', 'getStatus'] } },
		default: '',
		required: true,
		placeholder: 'e.g. 9817263',
		description:
			"ID of the message: the 'messageId' (or 'scheduledMessageId') output of a Send or Schedule operation",
	},
];

const whatsAppNumberFields: INodeProperties[] = [
	{
		displayName: 'WhatsApp Number',
		name: 'whatsappNumber',
		type: 'string',
		displayOptions: { show: { resource: ['whatsappNumber'], operation: ['connect'] } },
		default: '',
		required: true,
		placeholder: 'e.g. +919876543210',
		description: 'WhatsApp number to connect, with country code',
	},
	{
		displayName: 'Webhook URL',
		name: 'webhookUrl',
		type: 'string',
		displayOptions: { show: { resource: ['whatsappNumber'], operation: ['connect'] } },
		default: '',
		placeholder: 'e.g. https://example.com/wbiztool-qr',
		description:
			"Receives the QR code to scan (status qr_generated, qr_image) and then status connected or not_connected. Without it you can't see the QR code.",
	},
	{
		displayName: 'WhatsApp Client ID',
		name: 'whatsappClientId',
		type: 'number',
		displayOptions: { show: { resource: ['whatsappNumber'], operation: ['getStatus'] } },
		default: 0,
		required: true,
		placeholder: 'e.g. 678',
		description: 'ID of the WhatsApp number to check, from WbizTool → WhatsApp settings',
	},
	{
		displayName: 'Check Method',
		name: 'checkMethod',
		type: 'options',
		displayOptions: { show: { resource: ['whatsappNumber'], operation: ['getStatus'] } },
		options: [
			{
				name: 'General Status',
				value: 'general',
				description: 'POST /whatsapp-client/status/ with the ID in the body',
			},
			{
				name: 'Status by ID',
				value: 'byId',
				description: 'POST /whatsapp/status/{ID}/',
			},
		],
		default: 'general',
		description: 'Which WbizTool endpoint to ask; both give the same answer',
	},
];

const accountFields: INodeProperties[] = [
	{
		displayName: 'WhatsApp Client ID to Validate',
		name: 'whatsappClientId',
		type: 'number',
		displayOptions: { show: { resource: ['account'], operation: ['checkCredentials'] } },
		default: 0,
		description:
			'Also check that this WhatsApp number belongs to the workspace. Leave at 0 to skip.',
	},
];

export class WbizTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool',
		name: 'wbizTool',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Send, schedule and track WhatsApp messages from your own number, and manage your WhatsApp numbers, with WbizTool',
		defaults: {
			name: 'WbizTool',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'wbizToolApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Message', value: 'message' },
					{ name: 'WhatsApp Number', value: 'whatsappNumber' },
				],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						description: 'Cancel a queued or scheduled message',
						action: 'Cancel message',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Get the status of a message: queued, sent, failed, cancelled or expired',
						action: 'Get message status',
					},
					{
						name: 'Schedule',
						value: 'schedule',
						description: 'Schedule a message to a phone number or group for a later date and time',
						action: 'Schedule message',
					},
					{
						name: 'Send',
						value: 'send',
						description: 'Send a text, image or file message to a phone number or group',
						action: 'Send message',
					},
					{
						name: 'Send to Many',
						value: 'sendToMany',
						description: 'Send the same message to several phone numbers or groups',
						action: 'Send message to many recipients',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['whatsappNumber'] } },
				options: [
					{
						name: 'Connect',
						value: 'connect',
						description: 'Add a WhatsApp number to the workspace and get its QR code on a webhook',
						action: 'Connect number',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List the WhatsApp numbers in the workspace',
						action: 'Get many numbers',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Check whether a WhatsApp number is connected',
						action: 'Get number status',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Check Credentials',
						value: 'checkCredentials',
						description: 'Check that the Client ID and API key in the credential work',
						action: 'Check account credentials',
					},
				],
				default: 'checkCredentials',
			},
			...messageFields,
			...whatsAppNumberFields,
			...accountFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			if (resource === 'message') {
				if (operation === 'send') return await sendMessage.call(this, i);
				if (operation === 'sendToMany') return await sendToMany.call(this, i);
				if (operation === 'schedule') return await scheduleMessage.call(this, i);
				if (operation === 'cancel') return await cancelMessage.call(this, i);
				if (operation === 'getStatus') return await messageStatus.call(this, i);
			} else if (resource === 'whatsappNumber') {
				if (operation === 'getAll') return await listNumbers.call(this, i);
				if (operation === 'connect') return await connectNumber.call(this, i);
				if (operation === 'getStatus') return await numberStatus.call(this, i);
			} else if (resource === 'account') {
				if (operation === 'checkCredentials') return await checkCredentials.call(this, i);
			}
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" isn't supported for the resource "${resource}"`,
				{ itemIndex: i },
			);
		});
	}
}

/** Message Type, Message Text and the image or file fields, as the API reads them. */
function messageBody(this: IExecuteFunctions, i: number): IDataObject {
	const messageType = this.getNodeParameter('messageType', i) as string;
	return {
		msg_type: messageType,
		msg: this.getNodeParameter('message', i) as string,
		...mediaFields.call(this, messageType, i),
	};
}

/** Message › Send: /send_msg/ for a phone number, /send_msg/group/ for a group (the old Send Group Message node). */
async function sendMessage(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const targetType = this.getNodeParameter('targetType', i) as string;
	const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

	const body: IDataObject = {
		whatsapp_client: await whatsAppClientId.call(this, i),
		...messageBody.call(this, i),
	};
	if (targetType === 'phone') {
		// sent as typed: the API keeps the own country code of a number written with + or 00
		body.phone = requireText.call(this, this.getNodeParameter('phone', i), 'Phone Number', i);
		const countryCode = cleanCountryCode(this.getNodeParameter('countryCode', i, ''));
		if (countryCode) body.country_code = countryCode;
	} else {
		body.group_name = requireText.call(
			this,
			this.getNodeParameter('groupName', i),
			'Group Name',
			i,
		);
	}
	if (additionalOptions.expireAfterSeconds) {
		body.expire_after_seconds = additionalOptions.expireAfterSeconds;
	}
	if (additionalOptions.webhookUrl) body.webhook = additionalOptions.webhookUrl;

	const endpoint = targetType === 'group' ? '/send_msg/group/' : '/send_msg/';
	const response = await wbizToolApiRequest.call(this, endpoint, body, { itemIndex: i });

	return {
		success: true,
		messageId: response.msg_id ?? null,
		status: response.status,
		message: response.message,
		response,
		input: {
			targetType,
			target: targetType === 'phone' ? body.phone : body.group_name,
			countryCode: body.country_code ?? null,
			messageType: body.msg_type,
			message: body.msg,
		},
	};
}

/** Message › Send to Many: /send_msg/multi/ with one comma-separated string, as the API reads it. */
async function sendToMany(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const phoneNumbers = requireText.call(
		this,
		this.getNodeParameter('phoneNumbers', i),
		'Recipients',
		i,
	);
	const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;
	const phoneList = phoneNumbers
		.split(',')
		.map((phone) => phone.trim())
		.filter((phone) => phone);
	const countryCode = cleanCountryCode(this.getNodeParameter('countryCode', i, ''));

	const body: IDataObject = {
		whatsapp_client: await whatsAppClientId.call(this, i),
		...messageBody.call(this, i),
		phone: phoneNumbers,
	};
	if (countryCode) body.country_code = countryCode;
	if (additionalOptions.webhookUrl) body.webhook = additionalOptions.webhookUrl;

	const response = await wbizToolApiRequest.call(this, '/send_msg/multi/', body, { itemIndex: i });

	return {
		success: true,
		messageIds: response.msg_ids ?? [],
		status: response.status,
		message: response.message,
		response,
		input: {
			targetType: 'multi',
			phoneCount: phoneList.length,
			phoneNumbers: phoneList,
			countryCode,
			messageType: body.msg_type,
			message: body.msg,
		},
		statistics: {
			totalRecipients: phoneList.length,
		},
	};
}

/** Message › Schedule: /schedule_msg/ with the date as DD/MM/YYYY and the time as HH:MM. */
async function scheduleMessage(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const targetType = this.getNodeParameter('targetType', i) as string;
	const date = String(this.getNodeParameter('date', i) ?? '');
	const time = String(this.getNodeParameter('time', i) ?? '');
	const timezone = this.getNodeParameter('timezone', i) as string;
	const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

	const apiDate = toScheduleDate(date);
	if (!apiDate) {
		throw new NodeOperationError(this.getNode(), `Date "${date}" isn't a date this node can read`, {
			description: "Use DD/MM/YYYY (e.g. 15/01/2027) in 'Date'; DD-MM-YYYY and YYYY-MM-DD work too",
			itemIndex: i,
		});
	}
	const apiTime = toScheduleTime(time);
	if (!apiTime) {
		throw new NodeOperationError(this.getNode(), `Time "${time}" isn't a time this node can read`, {
			description: "Use HH:MM, 24-hour (e.g. 10:30 or 18:45) in 'Time'",
			itemIndex: i,
		});
	}

	const body: IDataObject = {
		whatsapp_client: await whatsAppClientId.call(this, i),
		...messageBody.call(this, i),
		date: apiDate,
		time: apiTime,
		timezone,
	};
	if (targetType === 'phone') {
		const phone = requireText.call(this, this.getNodeParameter('phone', i), 'Phone Number', i);
		const apiPhone = schedulePhone(phone);
		if (!apiPhone) {
			throw new NodeOperationError(
				this.getNode(),
				`Phone Number "${phone}" isn't 6 to 15 digits long`,
				{ description: "Enter the number with its country code in 'Phone Number'", itemIndex: i },
			);
		}
		body.phone = apiPhone;
		// A number written with + or 00 keeps its own country code, as the API's send_msg rule
		const countryCode = cleanCountryCode(this.getNodeParameter('countryCode', i, ''));
		if (countryCode && !isInternationalNumber(phone)) body.country_code = countryCode;
	} else {
		body.group_name = requireText.call(
			this,
			this.getNodeParameter('groupName', i),
			'Group Name',
			i,
		);
	}
	if (additionalOptions.webhookUrl) body.webhook = additionalOptions.webhookUrl;

	const response = await wbizToolApiRequest.call(this, '/schedule_msg/', body, { itemIndex: i });

	const scheduledTime = `${apiDate} ${apiTime} ${timezone}`;
	return {
		success: true,
		scheduledMessageId: response.msg_id ?? null,
		status: response.status,
		message: response.message,
		response,
		input: {
			targetType,
			target: targetType === 'phone' ? body.phone : body.group_name,
			countryCode: body.country_code ?? null,
			messageType: body.msg_type,
			message: body.msg,
			scheduledFor: scheduledTime,
		},
		scheduling: {
			date: apiDate,
			time: apiTime,
			timezone,
			scheduledTime,
		},
	};
}

/** Message › Cancel: /cancel_msg/. */
async function cancelMessage(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const messageId = requireText.call(this, this.getNodeParameter('messageId', i), 'Message ID', i);
	const response = await wbizToolApiRequest.call(
		this,
		'/cancel_msg/',
		{ msg_id: messageId },
		{ itemIndex: i },
	);
	return {
		success: true,
		status: response.status,
		message: response.message,
		response,
		input: { messageId },
		cancellation: {
			messageId,
			canceledAt: new Date().toISOString(),
			statusText: response.message,
		},
	};
}

/** Message › Get Status: /message/status/<id>/, every state an output item. */
async function messageStatus(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const messageId = requireText.call(this, this.getNodeParameter('messageId', i), 'Message ID', i);
	if (!/^\d+$/.test(messageId)) {
		throw new NodeOperationError(this.getNode(), `Message ID "${messageId}" isn't a number`, {
			description: "Map the 'messageId' output of a WbizTool Send operation",
			itemIndex: i,
		});
	}
	// `status` here is the message's state (0 = Created), so status 0 is not a refused request
	const response = await wbizToolApiRequest.call(
		this,
		`/message/status/${messageId}/`,
		{},
		{ allowStatusZero: true, itemIndex: i },
	);
	const state = readMessageState(response);
	if (!state) {
		throw new NodeApiError(this.getNode(), response as JsonObject, {
			message: String(response.error || response.message || 'Unknown message id'),
			description:
				apiMessageHint(response.message) ??
				"Check 'Message ID': it must be a message of this workspace",
			itemIndex: i,
		});
	}
	const errorMessage = typeof response.error === 'string' && response.error ? response.error : null;
	return {
		success: true,
		messageId,
		status: state.statusCode,
		message: response.message,
		statusText: state.statusText,
		error: errorMessage,
		response,
		input: { messageId },
		deliveryStatus: {
			messageId,
			statusText: state.statusText,
			deliveryStatus: state.deliveryStatus,
			errorMessage,
			checkedAt: new Date().toISOString(),
		},
	};
}

/** WhatsApp Number › Get Many: /whatsapp-client/list/. */
async function listNumbers(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const response = await wbizToolApiRequest.call(
		this,
		'/whatsapp-client/list/',
		{},
		{ itemIndex: i },
	);
	const clients = Array.isArray(response.whatsapp_clients)
		? (response.whatsapp_clients as IDataObject[])
		: [];
	const connected = clients.filter((client) => client.is_connected).length;
	return {
		success: true,
		status: response.status,
		message: response.message,
		clientsCount: clients.length,
		clients,
		response,
		summary: {
			totalClients: clients.length,
			connectedClients: connected,
			disconnectedClients: clients.length - connected,
			retrievedAt: new Date().toISOString(),
		},
	};
}

/** WhatsApp Number › Connect: /whatsapp-client/create/; the QR code goes to the webhook. */
async function connectNumber(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const whatsappNumber = requireText.call(
		this,
		this.getNodeParameter('whatsappNumber', i),
		'WhatsApp Number',
		i,
	);
	const webhookUrl = String(this.getNodeParameter('webhookUrl', i, '') ?? '').trim();
	const cleanNumber = whatsappNumber.replace(/[\s+\-()]/g, '');
	if (!/^\d{10,15}$/.test(cleanNumber)) {
		throw new NodeOperationError(
			this.getNode(),
			`WhatsApp Number "${whatsappNumber}" isn't 10 to 15 digits`,
			{
				description:
					"Enter the full number with country code in 'WhatsApp Number', e.g. +919876543210",
				itemIndex: i,
			},
		);
	}
	const body: IDataObject = { whatsapp_number: cleanNumber };
	if (webhookUrl) body.webhook_url = webhookUrl;

	const response = await wbizToolApiRequest.call(this, '/whatsapp-client/create/', body, {
		itemIndex: i,
	});
	return {
		success: true,
		status: response.status,
		message: response.message,
		whatsappClientId: response.whatsapp_client_id ?? null,
		response,
		input: {
			whatsappNumber: cleanNumber,
			webhookUrl: webhookUrl || null,
		},
		client: {
			whatsappClientId: response.whatsapp_client_id ?? null,
			whatsappNumber: cleanNumber,
			webhookUrl: webhookUrl || null,
			createdAt: new Date().toISOString(),
			status: 'created',
		},
	};
}

/** WhatsApp Number › Get Status: /whatsapp-client/status/ or /whatsapp/status/<id>/. */
async function numberStatus(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const whatsappClientId = Number(this.getNodeParameter('whatsappClientId', i));
	const checkMethod = this.getNodeParameter('checkMethod', i, 'general') as string;
	if (!Number.isInteger(whatsappClientId) || whatsappClientId <= 0) {
		throw new NodeOperationError(this.getNode(), "'WhatsApp Client ID' must be a positive number", {
			description: 'Use the ID shown on WbizTool → WhatsApp settings',
			itemIndex: i,
		});
	}
	const body: IDataObject = {};
	let endpoint: string;
	if (checkMethod === 'general') {
		body.whatsapp_client = whatsappClientId;
		endpoint = '/whatsapp-client/status/';
	} else {
		endpoint = `/whatsapp/status/${whatsappClientId}/`;
	}
	// /whatsapp-client/status/ answers a disconnected number with status 0 and "Disconnected"
	const response = await wbizToolApiRequest.call(this, endpoint, body, {
		allowStatusZero: true,
		itemIndex: i,
	});
	const isConnected = readConnection(response);
	if (isConnected === null) {
		throw new NodeApiError(this.getNode(), response as JsonObject, {
			message: String(response.message || 'Unknown answer from WbizTool'),
			description: apiMessageHint(response.message),
			itemIndex: i,
		});
	}
	const connectionStatus = isConnected ? 'connected' : 'disconnected';
	return {
		success: true,
		whatsappClientId,
		status: response.status,
		message: response.message,
		isConnected,
		connectionStatus,
		response,
		input: { whatsappClientId, checkMethod },
		statusCheck: {
			whatsappClientId,
			connectionStatus,
			isConnected,
			statusMessage: response.message,
			checkedAt: new Date().toISOString(),
			checkMethod,
		},
	};
}

/** Account › Check Credentials: /me/. */
async function checkCredentials(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const credentials = await this.getCredentials('wbizToolApi');
	const whatsappClientId = Number(this.getNodeParameter('whatsappClientId', i, 0));
	const body: IDataObject = {};
	if (whatsappClientId > 0) body.whatsapp_client = whatsappClientId;

	const response = await wbizToolApiRequest.call(this, '/me/', body, { itemIndex: i });
	return {
		success: true,
		status: response.status,
		message: response.message,
		accountName: response.name ?? null,
		response,
		validation: {
			credentialsValid: response.status === 1,
			clientId: credentials.clientId,
			whatsappClientId: whatsappClientId || null,
			accountName: response.name ?? null,
			validatedAt: new Date().toISOString(),
		},
	};
}
