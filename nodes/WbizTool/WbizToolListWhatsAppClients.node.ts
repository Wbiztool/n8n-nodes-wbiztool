import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import { forEachItem, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolListWhatsAppClients implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool List WhatsApp Clients',
		name: 'wbizToolListWhatsAppClients',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['input'],
		version: 1,
		subtitle: '=List all WhatsApp clients',
		description: 'List the WhatsApp numbers in your WbizTool workspace',
		defaults: {
			name: 'WbizTool List WhatsApp Clients',
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
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const response = await wbizToolApiRequest.call(
				this,
				'/whatsapp-client/list/',
				{},
				{ itemIndex: i },
			);

			const clients = Array.isArray(response.whatsapp_clients)
				? (response.whatsapp_clients as IDataObject[])
				: [];
			const connected = clients.filter((client) => client.is_connected).length;

			return {
				success: true,
				status: response.status,
				message: response.message,
				clientsCount: clients.length,
				clients,
				response,
				summary: {
					totalClients: clients.length,
					connectedClients: connected,
					disconnectedClients: clients.length - connected,
					retrievedAt: new Date().toISOString(),
				},
			};
		});
	}
}
