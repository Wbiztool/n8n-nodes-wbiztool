import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolMessageStatus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Message Status',
		name: 'wbizToolMessageStatus',
		icon: 'fa:comment',
		group: ['communication'],
		version: 1,
		subtitle: '=Check status of message ID {{$parameter["messageId"]}}',
		description: 'Check WhatsApp message delivery status via WbizTool',
		defaults: {
			name: 'WbizTool Message Status',
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
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '12345',
				description: 'ID of the message to check status for',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const messageId = this.getNodeParameter('messageId', i) as string;

				// Validate message ID
				if (!messageId.trim()) {
					throw new NodeOperationError(
						this.getNode(),
						'Message ID cannot be empty',
						{ itemIndex: i }
					);
				}

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
				};

				// Make the API request to message status endpoint (with ID in URL)
				const response = await wbizToolApiRequest.call(this, 'POST', `/message/status/${messageId}/`, body);

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
						messageId,
						status: response.status,
						message: response.message,
						statusText: response.status_text || response.message,
						error: response.error || null,
						response: response,
						input: {
							messageId,
						},
						deliveryStatus: {
							messageId,
							statusText: response.status_text || response.message,
							deliveryStatus: response.status === 1 ? 'delivered' : 'failed',
							errorMessage: response.error || null,
							checkedAt: new Date().toISOString(),
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