import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCancelMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Cancel Message',
		name: 'wbizToolCancelMessage',
		icon: 'fa:comment',
		group: ['communication'],
		version: 1,
		subtitle: '=Cancel message ID {{$parameter["messageId"]}}',
		description: 'Cancel scheduled WhatsApp messages via WbizTool',
		defaults: {
			name: 'WbizTool Cancel Message',
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
				description: 'ID of the scheduled message to cancel (from schedule message response)',
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
					msg_id: messageId,
				};

				// Make the API request to cancel message endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/cancel_msg/', body);

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
							messageId,
						},
						cancellation: {
							messageId,
							canceledAt: new Date().toISOString(),
							statusText: response.message,
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