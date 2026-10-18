import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	INodeType,
} from 'n8n-workflow';

export interface MockCall {
	credentialType: string;
	options: IHttpRequestOptions;
}

export interface MockRun {
	calls: MockCall[];
	run: () => Promise<IDataObject[]>;
}

export const CREDENTIALS = {
	clientId: 12345,
	apiKey: 'test-key',
	whatsappClientId: 678,
	baseUrl: 'https://wbiztool.com/api/v1',
};

/**
 * Runs `node.execute` for one input item with these parameters, answering every API call with `reply`
 * ({ statusCode, body } as n8n returns it with returnFullResponse + ignoreHttpStatusErrors).
 */
export function mockRun(
	node: INodeType,
	params: IDataObject,
	reply: { statusCode?: number; body: unknown },
	{
		typeVersion = 1.1,
		continueOnFail = false,
	}: { typeVersion?: number; continueOnFail?: boolean } = {},
): MockRun {
	const calls: MockCall[] = [];
	const nodeInfo: INode = {
		id: 'test',
		name: 'WbizTool',
		type: 'n8n-nodes-wbiztool.test',
		typeVersion,
		position: [0, 0],
		parameters: {},
	};
	const context = {
		getInputData: () => [{ json: {} }],
		getNode: () => nodeInfo,
		getCredentials: async () => CREDENTIALS,
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) => {
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Test is missing parameter ${name}`);
		},
		helpers: {
			httpRequestWithAuthentication: async (
				credentialType: string,
				options: IHttpRequestOptions,
			) => {
				calls.push({ credentialType, options });
				return { statusCode: reply.statusCode ?? 200, body: reply.body, headers: {} };
			},
		},
	} as unknown as IExecuteFunctions;

	return {
		calls,
		run: async () => {
			const output = (await node.execute!.call(context)) as INodeExecutionData[][];
			return output[0].map((item) => item.json);
		},
	};
}
