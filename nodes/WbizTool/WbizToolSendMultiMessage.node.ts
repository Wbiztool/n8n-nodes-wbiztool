import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolSendMultiMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Send Multi Message',
		name: 'wbizToolSendMultiMessage',
		icon: 'fa:comment',
		group: ['communication'],
		version: 1,
		subtitle: '={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message to {{$parameter["phoneNumbers"].split(",").length}} contacts',
		description: 'Send bulk WhatsApp messages to multiple recipients via WbizTool',
		defaults: {
			name: 'WbizTool Send Multi Message',
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
				displayName: 'Phone Numbers',
				name: 'phoneNumbers',
				type: 'string',
				default: '',
				required: true,
				placeholder: '919632066772,919632066773,919632066774',
				description: 'Comma-separated list of phone numbers with country code (no + symbol)',
			},
			{
				displayName: 'Country Code',
				name: 'countryCode',
				type: 'string',
				default: '91',
				required: true,
				placeholder: '91',
				description: 'Country code without + symbol (e.g., 91 for India, 1 for USA)',
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
				placeholder: 'Hello! This is a bulk message from n8n.',
				description: 'The message text to send to all recipients',
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
				displayName: 'WhatsApp Client ID',
				name: 'whatsappClientId',
				type: 'number',
				default: 0,
				description: 'Override the default WhatsApp Client ID from credentials',
				placeholder: 'Leave empty to use default from credentials',
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
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
				const phoneNumbers = this.getNodeParameter('phoneNumbers', i) as string;
				const countryCode = this.getNodeParameter('countryCode', i) as string;
				const messageType = this.getNodeParameter('messageType', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				const whatsappClientId = this.getNodeParameter('whatsappClientId', i, credentials.whatsappClientId) as number;
				const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as any;

				// Validate phone numbers
				if (!phoneNumbers.trim()) {
					throw new NodeOperationError(
						this.getNode(),
						'Phone numbers cannot be empty',
						{ itemIndex: i }
					);
				}

				// Clean and validate phone numbers
				const phoneList = phoneNumbers.split(',').map(phone => phone.trim()).filter(phone => phone);
				if (phoneList.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'No valid phone numbers found',
						{ itemIndex: i }
					);
				}

				// Validate country code
				const cleanCountryCode = countryCode.replace(/\D/g, '');
				if (!cleanCountryCode) {
					throw new NodeOperationError(
						this.getNode(),
						'Country code is required',
						{ itemIndex: i }
					);
				}

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
					whatsapp_client: whatsappClientId,
					msg_type: messageType,
					msg: message,
					phone: phoneNumbers, // Send as comma-separated string as per API
					country_code: cleanCountryCode,
				};

				// Add media URLs based on message type
				if (messageType === '1') {
					const imageUrl = this.getNodeParameter('imageUrl', i) as string;
					if (!imageUrl.trim()) {
						throw new NodeOperationError(
							this.getNode(),
							'Image URL is required for image messages',
							{ itemIndex: i }
						);
					}
					body.img_url = imageUrl;
				} else if (messageType === '2') {
					const fileUrl = this.getNodeParameter('fileUrl', i) as string;
					const fileName = this.getNodeParameter('fileName', i) as string;
					if (!fileUrl.trim()) {
						throw new NodeOperationError(
							this.getNode(),
							'File URL is required for file messages',
							{ itemIndex: i }
						);
					}
					if (!fileName.trim()) {
						throw new NodeOperationError(
							this.getNode(),
							'File name is required for file messages',
							{ itemIndex: i }
						);
					}
					body.file_url = fileUrl;
					body.file_name = fileName;
				}

				// Add additional options
				if (additionalOptions.webhookUrl) {
					body.webhook = additionalOptions.webhookUrl;
				}

				// Make the API request to multi message endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/send_msg/multi/', body);

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
						status: response.status,
						message: response.message,
						response: response,
						input: {
							targetType: 'multi',
							phoneCount: phoneList.length,
							phoneNumbers: phoneList,
							countryCode: cleanCountryCode,
							messageType,
							message,
						},
						statistics: {
							totalRecipients: phoneList.length,
							// Note: WbizTool API doesn't return detailed success/failure stats in the analyzed code
							// This would be enhanced based on actual API response structure
						},
					},
					pairedItem: { item: i },
				});

			} catch (error: any) {
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