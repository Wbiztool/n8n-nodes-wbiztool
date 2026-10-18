import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { forEachItem, requireText, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCreateWhatsAppClient implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Create WhatsApp Client',
		name: 'wbizToolCreateWhatsAppClient',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		version: 1,
		subtitle: '=Create WhatsApp client for {{$parameter["whatsappNumber"]}}',
		description:
			'Add a WhatsApp number to your WbizTool workspace and get its QR code on a webhook',
		defaults: {
			name: 'WbizTool Create WhatsApp Client',
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
				displayName: 'WhatsApp Number',
				name: 'whatsappNumber',
				type: 'string',
				default: '',
				required: true,
				placeholder: '+919632066772',
				description: 'WhatsApp number to connect, with country code',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'https://your-webhook.com/callback',
				description:
					"Receives the QR code to scan (status qr_generated, qr_image) and then status connected or not_connected. Without it you can't see the QR code.",
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const whatsappNumber = requireText.call(
				this,
				this.getNodeParameter('whatsappNumber', i),
				'WhatsApp Number',
				i,
			);
			const webhookUrl = String(this.getNodeParameter('webhookUrl', i, '')).trim();

			const cleanNumber = whatsappNumber.replace(/[\s+\-()]/g, '');
			if (!/^\d{10,15}$/.test(cleanNumber)) {
				throw new NodeOperationError(
					this.getNode(),
					`WhatsApp Number "${whatsappNumber}" isn't 10 to 15 digits`,
					{
						description: 'Enter the full number with country code, e.g. +919632066772',
						itemIndex: i,
					},
				);
			}

			const body: IDataObject = { whatsapp_number: cleanNumber };
			if (webhookUrl) {
				body.webhook_url = webhookUrl;
			}

			const response = await wbizToolApiRequest.call(this, '/whatsapp-client/create/', body, {
				itemIndex: i,
			});

			return {
				success: true,
				status: response.status,
				message: response.message,
				whatsappClientId: response.whatsapp_client_id ?? null,
				response,
				input: {
					whatsappNumber: cleanNumber,
					webhookUrl: webhookUrl || null,
				},
				client: {
					whatsappClientId: response.whatsapp_client_id ?? null,
					whatsappNumber: cleanNumber,
					webhookUrl: webhookUrl || null,
					createdAt: new Date().toISOString(),
					status: 'created',
				},
			};
		});
	}
}
