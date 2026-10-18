import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { forEachItem, readMessageState, requireText, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolMessageStatus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Message Status',
		name: 'wbizToolMessageStatus',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['input'],
		// 1.1: every message state is an output item (version 1 stopped with an error unless the message was Sent)
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle: '=Check status of message ID {{$parameter["messageId"]}}',
		description:
			'Get the status of a WhatsApp message sent via WbizTool: queued, sent, failed, cancelled or expired',
		defaults: {
			name: 'WbizTool Message Status',
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
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '12345',
				description: 'ID of the message to check (messageId from WbizTool Send Message)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const messageId = requireText.call(
				this,
				this.getNodeParameter('messageId', i),
				'Message ID',
				i,
			);
			if (!/^\d+$/.test(messageId)) {
				throw new NodeOperationError(this.getNode(), `Message ID "${messageId}" isn't a number`, {
					description: 'Map the messageId output of a WbizTool Send Message node',
					itemIndex: i,
				});
			}

			// `status` here is the message's state (0 = Created), so status 0 is not a failed request
			const response = await wbizToolApiRequest.call(
				this,
				`/message/status/${messageId}/`,
				{},
				{
					allowStatusZero: true,
					itemIndex: i,
				},
			);
			const state = readMessageState(response);
			if (!state) {
				throw new NodeApiError(this.getNode(), response as JsonObject, {
					message: String(response.error ?? response.message ?? 'Unknown message id'),
					description: 'Check the Message ID: it must be a message of this workspace',
					itemIndex: i,
				});
			}
			if (state.statusCode !== 1 && this.getNode().typeVersion < 1.1) {
				// Version 1 behaviour, kept for workflows that branch on it with "Continue On Fail"
				throw new NodeApiError(this.getNode(), response as JsonObject, {
					message: state.statusText,
					itemIndex: i,
				});
			}

			const errorMessage =
				typeof response.error === 'string' && response.error ? response.error : null;
			return {
				success: true,
				messageId,
				status: state.statusCode,
				message: response.message,
				statusText: state.statusText,
				error: errorMessage,
				response,
				input: {
					messageId,
				},
				deliveryStatus: {
					messageId,
					statusText: state.statusText,
					deliveryStatus: state.deliveryStatus,
					errorMessage,
					checkedAt: new Date().toISOString(),
				},
			};
		});
	}
}
