import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolSendMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Send Message',
		name: 'wbizToolSendMessage',
		icon: 'fa:comment',
		group: ['communication'],
		version: 1,
		subtitle: '={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message to {{$parameter["targetType"] === "phone" ? $parameter["phone"] : $parameter["groupName"]}}',
		description: 'Send WhatsApp messages via WbizTool',
		defaults: {
			name: 'WbizTool Send Message',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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
				description: 'Choose whether to send to a phone number or group',
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
			{
				displayName: 'Country Code',
				name: 'countryCode',
				type: 'string',
				displayOptions: {
					show: {
						targetType: ['phone'],
					},
				},
				default: '91',
				required: true,
				placeholder: '91',
				description: 'Country code without + symbol (e.g., 91 for India, 1 for USA)',
			},
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
				description: 'Name of the WhatsApp group',
			},
			{
				displayName: 'Message Type',
				name: 'messageType',
				type: 'options',
				options: [
					{
						name: 'Text',
						value: '0',
						description: 'Send text message only',
					},
					{
						name: 'Image with Text',
						value: '1',
						description: 'Send image with optional text',
					},
					{
						name: 'File with Text',
						value: '2',
						description: 'Send file with optional text',
					},
				],
				default: '0',
				description: 'Type of message to send',
			},
			{
				displayName: 'Message Text',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				placeholder: 'Hello! This is a test message from n8n.',
				description: 'The message text to send',
			},
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				displayOptions: {
					show: {
						messageType: ['1'],
					},
				},
				default: '',
				required: true,
				placeholder: 'https://example.com/image.jpg',
				description: 'URL of the image to send',
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				displayOptions: {
					show: {
						messageType: ['2'],
					},
				},
				default: '',
				required: true,
				placeholder: 'https://example.com/document.pdf',
				description: 'URL of the file to send',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				displayOptions: {
					show: {
						messageType: ['2'],
					},
				},
				default: '',
				required: true,
				placeholder: 'document.pdf',
				description: 'Name of the file being sent',
			},
			{
				displayName: 'WhatsApp Client ID (Optional)',
				name: 'whatsappClientId',
				type: 'number',
				default: '',
				description: 'Override the default WhatsApp Client ID from credentials',
				placeholder: 'Leave empty to use default from credentials',
				required: false,
			},
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
						description: 'Message expiry time in seconds (0 for no expiry)',
						placeholder: '3600',
					},
					{
						displayName: 'Webhook URL',
						name: 'webhookUrl',
						type: 'string',
						default: '',
						description: 'Webhook URL for delivery status notifications',
						placeholder: 'https://your-webhook.com/callback',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const targetType = this.getNodeParameter('targetType', i) as string;
				const messageType = this.getNodeParameter('messageType', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				let whatsappClientId = this.getNodeParameter('whatsappClientId', i, '') as string | number;
				if (!whatsappClientId || whatsappClientId === '' || whatsappClientId === 0) {
					whatsappClientId = credentials.whatsappClientId as number;
				}
				const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as any;

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
					whatsapp_client: whatsappClientId,
					msg_type: messageType,
					msg: message,
				};

				// Add target-specific parameters
				if (targetType === 'phone') {
					const phone = this.getNodeParameter('phone', i) as string;
					const countryCode = this.getNodeParameter('countryCode', i) as string;
					body.phone = phone;
					body.country_code = countryCode;
				} else {
					const groupName = this.getNodeParameter('groupName', i) as string;
					body.group_name = groupName;
				}

				// Add media URLs based on message type
				if (messageType === '1') {
					const imageUrl = this.getNodeParameter('imageUrl', i) as string;
					body.img_url = imageUrl;
				} else if (messageType === '2') {
					const fileUrl = this.getNodeParameter('fileUrl', i) as string;
					const fileName = this.getNodeParameter('fileName', i) as string;
					body.file_url = fileUrl;
					body.file_name = fileName;
				}

				// Add additional options
				if (additionalOptions.expireAfterSeconds) {
					body.expire_after_seconds = additionalOptions.expireAfterSeconds;
				}
				if (additionalOptions.webhookUrl) {
					body.webhook = additionalOptions.webhookUrl;
				}

				// Determine the endpoint
				const endpoint = targetType === 'group' ? '/send_msg/group/' : '/send_msg/';

				// Make the API request
				const response = await wbizToolApiRequest.call(this, 'POST', endpoint, body);

				// Check if the response indicates success
				if (response.status !== 1) {
					throw new NodeOperationError(
						this.getNode(),
						`WbizTool API Error: ${response.message}`,
						{ itemIndex: i }
					);
				}

				// Return the response data
				returnData.push({
					json: {
						success: true,
						messageId: response.msg_id || null,
						status: response.status,
						message: response.message,
						response: response,
						input: {
							targetType,
							target: targetType === 'phone' ? `${body.country_code}${body.phone}` : body.group_name,
							messageType,
							message,
						},
					},
					pairedItem: { item: i },
				});

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
} 