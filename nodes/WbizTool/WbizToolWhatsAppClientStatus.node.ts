import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { forEachItem, readConnection, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolWhatsAppClientStatus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool WhatsApp Client Status',
		name: 'wbizToolWhatsAppClientStatus',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['input'],
		// 1.1: a disconnected number is an output item with isConnected false (version 1 stopped with an error)
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle: '=Check status of WhatsApp client {{$parameter["whatsappClientId"]}}',
		description: 'Check whether a WhatsApp number in WbizTool is connected',
		defaults: {
			name: 'WbizTool WhatsApp Client Status',
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
				displayName: 'WhatsApp Client ID',
				name: 'whatsappClientId',
				type: 'number',
				default: 0,
				required: true,
				placeholder: '12345',
				description: 'ID of the WhatsApp number to check, from WbizTool → WhatsApp settings',
			},
			{
				displayName: 'Check Method',
				name: 'checkMethod',
				type: 'options',
				options: [
					{
						name: 'General Status',
						value: 'general',
						description: 'POST /whatsapp-client/status/ with the ID in the body',
					},
					{
						name: 'Status by ID',
						value: 'byId',
						description: 'POST /whatsapp/status/{ID}/',
					},
				],
				default: 'general',
				description: 'Which WbizTool endpoint to ask; both give the same answer',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const whatsappClientId = Number(this.getNodeParameter('whatsappClientId', i));
			const checkMethod = this.getNodeParameter('checkMethod', i) as string;

			if (!Number.isInteger(whatsappClientId) || whatsappClientId <= 0) {
				throw new NodeOperationError(
					this.getNode(),
					'WhatsApp Client ID must be a positive number',
					{
						itemIndex: i,
					},
				);
			}

			const body: IDataObject = {};
			let endpoint: string;
			if (checkMethod === 'general') {
				body.whatsapp_client = whatsappClientId;
				endpoint = '/whatsapp-client/status/';
			} else {
				endpoint = `/whatsapp/status/${whatsappClientId}/`;
			}

			// /whatsapp-client/status/ answers a disconnected number with status 0 and "Disconnected"
			const response = await wbizToolApiRequest.call(this, endpoint, body, {
				allowStatusZero: true,
				itemIndex: i,
			});
			const isConnected = readConnection(response);
			// Version 1 stopped on every status 0 answer, "Disconnected" included; kept for workflows that branch on it
			const v1Refusal = this.getNode().typeVersion < 1.1 && Number(response.status) !== 1;
			if (isConnected === null || v1Refusal) {
				throw new NodeApiError(this.getNode(), response as JsonObject, {
					message: String(response.message ?? 'Unknown answer from WbizTool'),
					itemIndex: i,
				});
			}
			const connectionStatus = isConnected ? 'connected' : 'disconnected';

			return {
				success: true,
				whatsappClientId,
				status: response.status,
				message: response.message,
				isConnected,
				connectionStatus,
				response,
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
			};
		});
	}
}
