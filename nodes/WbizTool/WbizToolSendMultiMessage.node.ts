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

export class WbizToolSendMultiMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Send Multi Message',
		name: 'wbizToolSendMultiMessage',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		// 1.1: Country Code is empty by default and optional (version 1 defaulted to 91 and required one)
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle:
			'={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message to multiple recipients',
		description: 'Send the same WhatsApp message to several numbers or groups via WbizTool',
		defaults: {
			name: 'WbizTool Send Multi Message',
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
				displayName: 'Phone Numbers',
				name: 'phoneNumbers',
				type: 'string',
				default: '',
				required: true,
				placeholder: '919632066772,919632066773,919632066774',
				description:
					'Comma-separated phone numbers with country code (no + symbol). Items with letters are sent as group names.',
			},
			...countryCodeProperties(),
			...messageProperties('Hello! This is a bulk message from n8n.'),
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
			const phoneNumbers = requireText.call(
				this,
				this.getNodeParameter('phoneNumbers', i),
				'Phone Numbers',
				i,
			);
			const messageType = this.getNodeParameter('messageType', i) as string;
			const message = this.getNodeParameter('message', i) as string;
			const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

			const phoneList = phoneNumbers
				.split(',')
				.map((phone) => phone.trim())
				.filter((phone) => phone);
			const countryCode = cleanCountryCode(this.getNodeParameter('countryCode', i, ''));
			if (!countryCode && this.getNode().typeVersion < 1.1) {
				requireText.call(this, countryCode, 'Country Code', i);
			}

			const body: IDataObject = {
				// 0.1.x sent the field's 0 instead of the credential's number: "Invalid whatsapp client 0"
				whatsapp_client: await whatsAppClientId.call(this, i),
				msg_type: messageType,
				msg: message,
				phone: phoneNumbers, // one comma-separated string, as the API reads it
				...mediaFields.call(this, messageType, i),
			};
			if (countryCode) body.country_code = countryCode;
			if (additionalOptions.webhookUrl) {
				body.webhook = additionalOptions.webhookUrl;
			}

			const response = await wbizToolApiRequest.call(this, '/send_msg/multi/', body, {
				itemIndex: i,
			});

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
					messageType,
					message,
				},
				statistics: {
					totalRecipients: phoneList.length,
				},
			};
		});
	}
}
