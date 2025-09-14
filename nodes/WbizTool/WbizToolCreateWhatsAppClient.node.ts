import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCreateWhatsAppClient implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Create WhatsApp Client',
		name: 'wbizToolCreateWhatsAppClient',
		icon: 'fa:comment',
		group: ['utility'],
		version: 1,
		subtitle: '=Create WhatsApp client for {{$parameter["whatsappNumber"]}}',
		description: 'Create a new WhatsApp client connection via WbizTool',
		defaults: {
			name: 'WbizTool Create WhatsApp Client',
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
				displayName: 'WhatsApp Number',
				name: 'whatsappNumber',
				type: 'string',
				default: '',
				required: true,
				placeholder: '+919632066772',
				description: 'WhatsApp number to connect (with or without + symbol)',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				required: false,
				placeholder: 'https://your-webhook.com/callback',
				description: 'Webhook URL for notifications (optional)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const whatsappNumber = this.getNodeParameter('whatsappNumber', i) as string;
				const webhookUrl = this.getNodeParameter('webhookUrl', i, '') as string;

				// Validate WhatsApp number
				if (!whatsappNumber.trim()) {
					throw new NodeOperationError(
						this.getNode(),
						'WhatsApp number cannot be empty',
						{ itemIndex: i }
					);
				}

				// Clean WhatsApp number (remove + and spaces)
				const cleanNumber = whatsappNumber.replace(/[\s+\-()]/g, '');
				if (!/^\d{10,15}$/.test(cleanNumber)) {
					throw new NodeOperationError(
						this.getNode(),
						'WhatsApp number must be 10-15 digits',
						{ itemIndex: i }
					);
				}

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
					whatsapp_number: cleanNumber,
				};

				// Add webhook URL if provided
				if (webhookUrl.trim()) {
					body.webhook_url = webhookUrl;
				}

				// Make the API request to create WhatsApp client endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/whatsapp-client/create/', body);

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
						whatsappClientId: response.whatsapp_client_id || null,
						response: response,
						input: {
							whatsappNumber: cleanNumber,
							webhookUrl: webhookUrl || null,
						},
						client: {
							whatsappClientId: response.whatsapp_client_id || null,
							whatsappNumber: cleanNumber,
							webhookUrl: webhookUrl || null,
							createdAt: new Date().toISOString(),
							status: 'created',
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