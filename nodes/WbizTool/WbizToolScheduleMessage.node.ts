import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import {
	cleanCountryCode,
	countryCodeProperties,
	forEachItem,
	mediaFields,
	messageProperties,
	requireText,
	toScheduleDate,
	toScheduleTime,
	webhookUrlOption,
	whatsAppClientId,
	whatsAppClientIdProperty,
	wbizToolApiRequest,
} from './GenericFunctions';

export class WbizToolScheduleMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Schedule Message',
		name: 'wbizToolScheduleMessage',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		// 1.1: Country Code is empty by default and optional (version 1 defaulted to 91 and required one)
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle:
			'={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message scheduled for {{$parameter["date"]}} {{$parameter["time"]}}',
		description: 'Schedule a WhatsApp message for a later date and time via WbizTool',
		defaults: {
			name: 'WbizTool Schedule Message',
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
				displayName: 'Target Type',
				name: 'targetType',
				type: 'options',
				options: [
					{
						name: 'Phone Number',
						value: 'phone',
						description: 'Schedule message to an individual phone number',
					},
					{
						name: 'Group',
						value: 'group',
						description: 'Schedule message to a WhatsApp group',
					},
				],
				default: 'phone',
				description: 'Whether to schedule the message to a phone number or a group',
			},
			{
				displayName: 'Phone Number',
				name: 'phone',
				type: 'string',
				displayOptions: {
					show: {
						targetType: ['phone'],
					},
				},
				default: '',
				required: true,
				placeholder: '919632066772',
				description: 'WhatsApp phone number with country code (no + symbol)',
			},
			...countryCodeProperties({ targetType: ['phone'] }),
			{
				displayName: 'Group Name',
				name: 'groupName',
				type: 'string',
				displayOptions: {
					show: {
						targetType: ['group'],
					},
				},
				default: '',
				required: true,
				placeholder: 'My WhatsApp Group',
				description: 'Exact name of a WhatsApp group your number is in',
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'string',
				default: '',
				required: true,
				placeholder: '15/01/2024',
				description:
					'Date to send the message: DD/MM/YYYY (DD-MM-YYYY and YYYY-MM-DD are converted)',
			},
			{
				displayName: 'Time',
				name: 'time',
				type: 'string',
				default: '',
				required: true,
				placeholder: '10:30',
				description: 'Time to send the message (HH:MM format, 24-hour)',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'options',
				options: [
					{
						name: 'CET (Central European Time)',
						value: 'CET',
					},
					{
						name: 'EST (Eastern Standard Time)',
						value: 'EST',
					},
					{
						name: 'GMT (Greenwich Mean Time)',
						value: 'GMT',
					},
					{
						name: 'IST (India Standard Time)',
						value: 'IST',
					},
					{
						name: 'PST (Pacific Standard Time)',
						value: 'PST',
					},
					{
						name: 'UTC (Coordinated Universal Time)',
						value: 'UTC',
					},
				],
				default: 'IST',
				description:
					'Timezone of the date and time; daylight saving time is applied for EST, PST and CET',
			},
			...messageProperties('Hello! This is a scheduled message from n8n.'),
			whatsAppClientIdProperty,
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [webhookUrlOption],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const targetType = this.getNodeParameter('targetType', i) as string;
			const date = this.getNodeParameter('date', i) as string;
			const time = this.getNodeParameter('time', i) as string;
			const timezone = this.getNodeParameter('timezone', i) as string;
			const messageType = this.getNodeParameter('messageType', i) as string;
			const message = this.getNodeParameter('message', i) as string;
			const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

			// The API reads DD/MM/YYYY HH:MM: 0.1.2 sent DD-MM-YYYY as typed, so every schedule failed
			const apiDate = toScheduleDate(date);
			if (!apiDate) {
				throw new NodeOperationError(
					this.getNode(),
					`Date "${date}" isn't a date this node can read`,
					{
						description:
							'Use DD/MM/YYYY (e.g. 15/01/2024); DD-MM-YYYY and YYYY-MM-DD are accepted too',
						itemIndex: i,
					},
				);
			}
			const apiTime = toScheduleTime(time);
			if (!apiTime) {
				throw new NodeOperationError(
					this.getNode(),
					`Time "${time}" isn't a time this node can read`,
					{
						description: 'Use HH:MM, 24-hour (e.g. 10:30 or 18:45)',
						itemIndex: i,
					},
				);
			}

			const body: IDataObject = {
				// 0.1.x sent the field's 0 instead of the credential's number: "Invalid whatsapp client 0"
				whatsapp_client: await whatsAppClientId.call(this, i),
				msg_type: messageType,
				msg: message,
				date: apiDate,
				time: apiTime,
				timezone,
			};

			if (targetType === 'phone') {
				const phone = requireText.call(this, this.getNodeParameter('phone', i), 'Phone Number', i);
				const cleanPhone = phone.replace(/\D/g, '');
				if (cleanPhone.length < 6 || cleanPhone.length > 15) {
					throw new NodeOperationError(
						this.getNode(),
						`Phone Number "${phone}" isn't 6 to 15 digits long`,
						{
							itemIndex: i,
						},
					);
				}
				const countryCode = cleanCountryCode(this.getNodeParameter('countryCode', i, ''));
				if (!countryCode && this.getNode().typeVersion < 1.1) {
					requireText.call(this, countryCode, 'Country Code', i);
				}
				body.phone = cleanPhone;
				if (countryCode) body.country_code = countryCode;
			} else {
				body.group_name = requireText.call(
					this,
					this.getNodeParameter('groupName', i),
					'Group Name',
					i,
				);
			}

			Object.assign(body, mediaFields.call(this, messageType, i));
			if (additionalOptions.webhookUrl) {
				body.webhook = additionalOptions.webhookUrl;
			}

			const response = await wbizToolApiRequest.call(this, '/schedule_msg/', body, {
				itemIndex: i,
			});

			const scheduledTime = `${apiDate} ${apiTime} ${timezone}`;
			return {
				success: true,
				scheduledMessageId: response.msg_id ?? null,
				status: response.status,
				message: response.message,
				response,
				input: {
					targetType,
					target:
						targetType === 'phone' ? `${body.country_code ?? ''}${body.phone}` : body.group_name,
					messageType,
					message,
					scheduledFor: scheduledTime,
				},
				scheduling: {
					date: apiDate,
					time: apiTime,
					timezone,
					scheduledTime,
				},
			};
		});
	}
}
