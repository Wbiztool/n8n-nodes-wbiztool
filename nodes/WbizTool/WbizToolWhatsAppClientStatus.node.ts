import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolWhatsAppClientStatus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool WhatsApp Client Status',
		name: 'wbizToolWhatsAppClientStatus',
		icon: 'fa:comment',
		group: ['utility'],
		version: 1,
		subtitle: '=Check status of WhatsApp client {{$parameter["whatsappClientId"]}}',
		description: 'Check WhatsApp client connection status via WbizTool',
		defaults: {
			name: 'WbizTool WhatsApp Client Status',
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
				displayName: 'WhatsApp Client ID',
				name: 'whatsappClientId',
				type: 'number',
				default: 0,
				required: true,
				placeholder: '12345',
				description: 'WhatsApp Client ID to check status for',
			},
			{
				displayName: 'Check Method',
				name: 'checkMethod',
				type: 'options',
				options: [
					{
						name: 'General Status',
						value: 'general',
						description: 'Check general client status (requires whatsapp_client parameter)',
					},
					{
						name: 'Status by ID',
						value: 'byId',
						description: 'Check status using client ID in URL path',
					},
				],
				default: 'general',
				description: 'Method to check WhatsApp client status',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const whatsappClientId = this.getNodeParameter('whatsappClientId', i) as number;
				const checkMethod = this.getNodeParameter('checkMethod', i) as string;

				// Validate WhatsApp client ID
				if (!whatsappClientId || whatsappClientId <= 0) {
					throw new NodeOperationError(
						this.getNode(),
						'WhatsApp Client ID must be a positive number',
						{ itemIndex: i }
					);
				}

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
				};

				let endpoint: string;
				let response: any;

				if (checkMethod === 'general') {
					// General status check (requires whatsapp_client parameter)
					body.whatsapp_client = whatsappClientId;
					endpoint = '/whatsapp-client/status/';
				} else {
					// Status by ID (client ID in URL)
					endpoint = `/whatsapp/status/${whatsappClientId}/`;
				}

				// Make the API request to check WhatsApp client status
				response = await wbizToolApiRequest.call(this, 'POST', endpoint, body);

				// Check if the response indicates success
				if (response.status !== 1) {
					throw new NodeOperationError(
						this.getNode(),
						`WbizTool API Error: ${response.message}`,
						{ itemIndex: i }
					);
				}

				// Determine connection status
				const isConnected = response.message?.toLowerCase().includes('connected') || false;
				const connectionStatus = isConnected ? 'connected' : 'disconnected';

				// Return the response data
				returnData.push({
					json: {
						success: true,
						whatsappClientId,
						status: response.status,
						message: response.message,
						isConnected,
						connectionStatus,
						response: response,
						input: {
							whatsappClientId,
							checkMethod,
						},
						statusCheck: {
							whatsappClientId,
							connectionStatus,
							isConnected,
							statusMessage: response.message,
							checkedAt: new Date().toISOString(),
							checkMethod,
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