import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import {
	forEachItem,
	mediaFields,
	messageProperties,
	requireText,
	webhookUrlOption,
	whatsAppClientId,
	whatsAppClientIdProperty,
	wbizToolApiRequest,
} from './GenericFunctions';

export class WbizToolSendGroupMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WbizTool Send Group Message',
		name: 'wbizToolSendGroupMessage',
		icon: { light: 'file:../../icons/wbiztool.png', dark: 'file:../../icons/wbiztool.png' },
		group: ['output'],
		version: 1,
		subtitle:
			'={{$parameter["messageType"] === "0" ? "Text" : $parameter["messageType"] === "1" ? "Image" : "File"}} message to group {{$parameter["groupName"]}}',
		description: 'Send a WhatsApp message to a group via WbizTool',
		defaults: {
			name: 'WbizTool Send Group Message',
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
				displayName: 'Group Name',
				name: 'groupName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'My WhatsApp Group',
				description: 'Exact name of a WhatsApp group your number is in',
			},
			...messageProperties('Hello group! This is a message from n8n.'),
			whatsAppClientIdProperty,
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Expire After (Seconds)',
						name: 'expireAfterSeconds',
						type: 'number',
						default: 0,
						description: 'Cancel the message if it is not sent within this many seconds (0: never)',
						placeholder: '3600',
					},
					webhookUrlOption,
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await forEachItem.call(this, async (i) => {
			const groupName = requireText.call(
				this,
				this.getNodeParameter('groupName', i),
				'Group Name',
				i,
			);
			const messageType = this.getNodeParameter('messageType', i) as string;
			const message = this.getNodeParameter('message', i) as string;
			const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

			const body: IDataObject = {
				// 0.1.x sent the field's 0 instead of the credential's number: "Invalid whatsapp client 0"
				whatsapp_client: await whatsAppClientId.call(this, i),
				msg_type: messageType,
				msg: message,
				group_name: groupName,
				...mediaFields.call(this, messageType, i),
			};
			if (additionalOptions.expireAfterSeconds) {
				body.expire_after_seconds = additionalOptions.expireAfterSeconds;
			}
			if (additionalOptions.webhookUrl) {
				body.webhook = additionalOptions.webhookUrl;
			}

			const response = await wbizToolApiRequest.call(this, '/send_msg/group/', body, {
				itemIndex: i,
			});

			return {
				success: true,
				messageId: response.msg_id ?? null,
				status: response.status,
				message: response.message,
				response,
				input: {
					targetType: 'group',
					target: groupName,
					messageType,
					message,
				},
			};
		});
	}
}
