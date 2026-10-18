import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import { forEachItem, requireText, wbizToolApiRequest } from './GenericFunctions';

export class WbizToolCancelMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Cancel Message',
		name: 'wbizToolCancelMessage',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		version: 1,
		subtitle: '=Cancel message ID {{$parameter["messageId"]}}',
		description: 'Cancel a queued or scheduled WhatsApp message via WbizTool',
		defaults: {
			name: 'WbizTool Cancel Message',
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
				description:
					'ID of the message to cancel (messageId or scheduledMessageId from an earlier WbizTool node)',
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

			const response = await wbizToolApiRequest.call(
				this,
				'/cancel_msg/',
				{ msg_id: messageId },
				{ itemIndex: i },
			);

			return {
				success: true,
				status: response.status,
				message: response.message,
				response,
				input: {
					messageId,
				},
				cancellation: {
					messageId,
					canceledAt: new Date().toISOString(),
					statusText: response.message,
				},
			};
		});
	}
}
