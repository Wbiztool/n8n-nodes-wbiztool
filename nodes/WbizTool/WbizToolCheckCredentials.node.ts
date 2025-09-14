import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCheckCredentials implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Check Credentials',
		name: 'wbizToolCheckCredentials',
		icon: 'fa:comment',
		group: ['utility'],
		version: 1,
		subtitle: '=Validate API credentials and account status',
		description: 'Check WbizTool API credentials and account status',
		defaults: {
			name: 'WbizTool Check Credentials',
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
				displayName: 'WhatsApp Client ID to Validate',
				name: 'whatsappClientId',
				type: 'number',
				default: 0,
				description: 'Specific WhatsApp Client ID to validate (optional)',
				placeholder: 'Leave empty to skip WhatsApp client validation',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const whatsappClientId = this.getNodeParameter('whatsappClientId', i, credentials.whatsappClientId) as number;

				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
				};

				// Add WhatsApp client ID if provided
				if (whatsappClientId && whatsappClientId > 0) {
					body.whatsapp_client = whatsappClientId;
				}

				// Make the API request to check credentials endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/me/', body);

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
						accountName: response.name || null,
						response: response,
						validation: {
							credentialsValid: response.status === 1,
							clientId: credentials.clientId,
							whatsappClientId: whatsappClientId || null,
							accountName: response.name || null,
							validatedAt: new Date().toISOString(),
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
							validation: {
								credentialsValid: false,
								validatedAt: new Date().toISOString(),
							},
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