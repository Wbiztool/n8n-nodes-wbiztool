import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import {
	cleanCountryCode,
	countryCodeProperties,
	forEachItem,
	mediaFields,
	messageProperties,
	requireText,
	webhookUrlOption,
	whatsAppClientId,
	whatsAppClientIdProperty,
	wbizToolApiRequest,
} from './GenericFunctions';

export class WbizToolSendMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Send Message',
		name: 'wbizToolSendMessage',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		// 1.1: Country Code is empty by default (version 1 defaulted to 91)
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle:
			'={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message to {{$parameter["targetType"] === "phone" ? $parameter["phone"] : $parameter["groupName"]}}',
		description: 'Send a WhatsApp message to a phone number or group via WbizTool',
		defaults: {
			name: 'WbizTool Send Message',
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
						description: 'Send message to an individual phone number',
					},
					{
						name: 'Group',
						value: 'group',
						description: 'Send message to a WhatsApp group',
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
			...messageProperties('Hello! This is a test message from n8n.'),
			whatsAppClientIdProperty,
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Expire After (Seconds)',
						name: 'expireAfterSeconds',
						type: 'number',
						default: 0,
						description: 'Cancel the message if it is not sent within this many seconds (0: never)',
						placeholder: '3600',
					},
					webhookUrlOption,
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const targetType = this.getNodeParameter('targetType', i) as string;
			const messageType = this.getNodeParameter('messageType', i) as string;
			const message = this.getNodeParameter('message', i) as string;
			const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

			const body: IDataObject = {
				whatsapp_client: await whatsAppClientId.call(this, i),
				msg_type: messageType,
				msg: message,
			};

			if (targetType === 'phone') {
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

			Object.assign(body, mediaFields.call(this, messageType, i));

			if (additionalOptions.expireAfterSeconds) {
				body.expire_after_seconds = additionalOptions.expireAfterSeconds;
			}
			if (additionalOptions.webhookUrl) {
				body.webhook = additionalOptions.webhookUrl;
			}

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
					target:
						targetType === 'phone' ? `${body.country_code ?? ''}${body.phone}` : body.group_name,
					messageType,
					message,
				},
			};
		});
	}
}
