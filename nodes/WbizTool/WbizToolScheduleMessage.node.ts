import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolScheduleMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Schedule Message',
		name: 'wbizToolScheduleMessage',
		icon: 'fa:comment',
		group: ['communication'],
		version: 1,
		subtitle: '={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message scheduled for {{$parameter["date"]}} {{$parameter["time"]}}',
		description: 'Schedule WhatsApp messages for future delivery via WbizTool',
		defaults: {
			name: 'WbizTool Schedule Message',
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
						description: 'Schedule message to an individual phone number',
					},
					{
						name: 'Group',
						value: 'group',
						description: 'Schedule message to a WhatsApp group',
					},
				],
				default: 'phone',
				description: 'Choose whether to schedule message to a phone number or group',
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
				displayName: 'Date',
				name: 'date',
				type: 'string',
				default: '',
				required: true,
				placeholder: '15-01-2024',
				description: 'Date to send the message (DD-MM-YYYY format)',
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
						name: 'IST (India Standard Time)',
						value: 'IST',
					},
					{
						name: 'UTC (Coordinated Universal Time)',
						value: 'UTC',
					},
					{
						name: 'EST (Eastern Standard Time)',
						value: 'EST',
					},
					{
						name: 'PST (Pacific Standard Time)',
						value: 'PST',
					},
					{
						name: 'GMT (Greenwich Mean Time)',
						value: 'GMT',
					},
					{
						name: 'CET (Central European Time)',
						value: 'CET',
					},
				],
				default: 'IST',
				description: 'Timezone for the scheduled message',
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
				placeholder: 'Hello! This is a scheduled message from n8n.',
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
				const targetType = this.getNodeParameter('targetType', i) as string;
				const date = this.getNodeParameter('date', i) as string;
				const time = this.getNodeParameter('time', i) as string;
				const timezone = this.getNodeParameter('timezone', i) as string;
				const messageType = this.getNodeParameter('messageType', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				const whatsappClientId = this.getNodeParameter('whatsappClientId', i, credentials.whatsappClientId) as number;
				const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as any;

				// Validate date format (DD-MM-YYYY)
				const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
				if (!dateRegex.test(date)) {
					throw new NodeOperationError(
						this.getNode(),
						'Date must be in DD-MM-YYYY format (e.g., 15-01-2024)',
						{ itemIndex: i }
					);
				}

				// Validate time format (HH:MM)
				const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
				if (!timeRegex.test(time)) {
					throw new NodeOperationError(
						this.getNode(),
						'Time must be in HH:MM format (e.g., 10:30)',
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
					date: date,
					time: time,
					timezone: timezone,
				};

				// Add target-specific parameters
				if (targetType === 'phone') {
					const phone = this.getNodeParameter('phone', i) as string;
					const countryCode = this.getNodeParameter('countryCode', i) as string;
					
					// Validate phone number
					const cleanPhone = phone.replace(/\D/g, '');
					const cleanCountryCode = countryCode.replace(/\D/g, '');
					
					if (!cleanPhone || cleanPhone.length < 6 || cleanPhone.length > 15) {
						throw new NodeOperationError(
							this.getNode(),
							'Phone number must be between 6 and 15 digits',
							{ itemIndex: i }
						);
					}
					
					if (!cleanCountryCode) {
						throw new NodeOperationError(
							this.getNode(),
							'Country code is required',
							{ itemIndex: i }
						);
					}
					
					body.phone = cleanPhone;
					body.country_code = cleanCountryCode;
				} else {
					const groupName = this.getNodeParameter('groupName', i) as string;
					if (!groupName.trim()) {
						throw new NodeOperationError(
							this.getNode(),
							'Group name cannot be empty',
							{ itemIndex: i }
						);
					}
					body.group_name = groupName;
				}

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

				// Make the API request to schedule message endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/schedule_msg/', body);

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
						scheduledMessageId: response.msg_id || null,
						status: response.status,
						message: response.message,
						response: response,
						input: {
							targetType,
							target: targetType === 'phone' ? `${body.country_code}${body.phone}` : body.group_name,
							messageType,
							message,
							scheduledFor: `${date} ${time} ${timezone}`,
						},
						scheduling: {
							date,
							time,
							timezone,
							scheduledTime: `${date} ${time} ${timezone}`,
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