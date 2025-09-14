import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WbizToolApi implements ICredentialType {
	name = 'wbizToolApi';
	displayName = 'WbizTool API';
	documentationUrl = 'https://wbiztool.com/docs/';
	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'number',
			default: 0,
			required: true,
			description: 'Your unique Client ID from WbizTool API Keys page',
			placeholder: 'e.g. 12345',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your API Key from WbizTool API Keys page',
			placeholder: 'e.g. wbt_live_abc123...',
		},
		{
			displayName: 'WhatsApp Client ID',
			name: 'whatsappClientId',
			type: 'number',
			default: 0,
			required: true,
			description: 'Your default WhatsApp Client ID (can be overridden in individual nodes)',
			placeholder: 'e.g. 67890',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://wbiztool.com/api/v1',
			required: true,
			description: 'WbizTool API base URL',
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
			body: {
				client_id: '={{$credentials.clientId}}',
				api_key: '={{$credentials.apiKey}}',
				whatsapp_client: '={{$credentials.whatsappClientId}}',
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