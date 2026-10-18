import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import { forEachItem, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCheckCredentials implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Check Credentials',
		name: 'wbizToolCheckCredentials',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['input'],
		version: 1,
		subtitle: '=Validate API credentials and account status',
		description: 'Check that the WbizTool Client ID and API key work',
		defaults: {
			name: 'WbizTool Check Credentials',
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
		properties: [
			{
				displayName: 'WhatsApp Client ID to Validate',
				name: 'whatsappClientId',
				type: 'number',
				default: 0,
				description:
					'Also check that this WhatsApp number belongs to the workspace. Leave at 0 to skip.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('wbizToolApi');
		return await forEachItem.call(this, async (i) => {
			const whatsappClientId = Number(this.getNodeParameter('whatsappClientId', i, 0));

			const body: IDataObject = {};
			if (whatsappClientId > 0) {
				body.whatsapp_client = whatsappClientId;
			}

			const response = await wbizToolApiRequest.call(this, '/me/', body, { itemIndex: i });

			return {
				success: true,
				status: response.status,
				message: response.message,
				accountName: response.name ?? null,
				response,
				validation: {
					credentialsValid: response.status === 1,
					clientId: credentials.clientId,
					whatsappClientId: whatsappClientId || null,
					accountName: response.name ?? null,
					validatedAt: new Date().toISOString(),
				},
			};
		});
	}
}
