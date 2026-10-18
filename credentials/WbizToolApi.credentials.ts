import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class WbizToolApi implements ICredentialType {
	name = 'wbizToolApi';
	displayName = 'WbizTool API';
	// The brand icon (green bubble, white marks) reads on both themes
	icon: Icon = { light: 'file:../icons/wbiztool.png', dark: 'file:../icons/wbiztool.png' };
	documentationUrl = 'https://wbiztool.com/docs/n8n-integration/';
	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'number',
			default: 0,
			required: true,
			description: 'Your Client ID from WbizTool → Settings → API keys',
			placeholder: 'e.g. 12345',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your API key from WbizTool → Settings → API keys',
		},
		{
			displayName: 'WhatsApp Client ID',
			name: 'whatsappClientId',
			type: 'number',
			default: 0,
			required: true,
			description:
				'The WhatsApp number to send from by default, from WbizTool → WhatsApp settings. Nodes with a WhatsApp Client ID field can override it.',
			placeholder: 'e.g. 67890',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://wbiztool.com/api/v1',
			required: true,
			description: 'Keep the default unless WbizTool support gives you another one',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			body: {
				client_id: '={{$credentials.clientId}}',
				api_key: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me/',
			method: 'POST',
			// source and User-Agent: as nodes/WbizTool/GenericFunctions.ts sends them (WbizTool's analytics)
			headers: {
				'User-Agent': 'n8n-nodes-wbiztool/0.2.0',
			},
			body: {
				client_id: '={{$credentials.clientId}}',
				api_key: '={{$credentials.apiKey}}',
				whatsapp_client: '={{$credentials.whatsappClientId}}',
				source: 'n8n',
			},
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 200,
					message: 'Connection successful',
				},
			},
		],
	};
}
