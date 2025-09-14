import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { wbizToolApiRequest } from './GenericFunctions';

export class WbizToolListWhatsAppClients implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool List WhatsApp Clients',
		name: 'wbizToolListWhatsAppClients',
		icon: 'fa:comment',
		group: ['utility'],
		version: 1,
		subtitle: '=List all WhatsApp clients',
		description: 'Get all WhatsApp clients for your WbizTool account',
		defaults: {
			name: 'WbizTool List WhatsApp Clients',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'wbizToolApi',
				required: true,
			},
		],
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('wbizToolApi');

		for (let i = 0; i < items.length; i++) {
			try {
				// Build the request body
				const body: any = {
					client_id: credentials.clientId,
					api_key: credentials.apiKey,
				};

				// Make the API request to list WhatsApp clients endpoint
				const response = await wbizToolApiRequest.call(this, 'POST', '/whatsapp-client/list/', body);

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
						clientsCount: response.whatsapp_clients?.length || 0,
						clients: response.whatsapp_clients || [],
						response: response,
						summary: {
							totalClients: response.whatsapp_clients?.length || 0,
							connectedClients: response.whatsapp_clients?.filter((client: any) => client.is_connected).length || 0,
							disconnectedClients: response.whatsapp_clients?.filter((client: any) => !client.is_connected).length || 0,
							retrievedAt: new Date().toISOString(),
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