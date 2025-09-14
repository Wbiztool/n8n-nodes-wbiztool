import { IExecuteFunctions, ILoadOptionsFunctions, NodeApiError, IHttpRequestOptions } from 'n8n-workflow';

/**
 * Make an API request to WbizTool
 */
export async function wbizToolApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
	endpoint: string,
	body: object = {},
	headers: object = {},
): Promise<any> {
	const credentials = await this.getCredentials('wbizToolApi');
	
	if (!credentials) {
		throw new NodeApiError(this.getNode(), { message: 'No credentials found!' });
	}

	// Convert body object to URL-encoded string for WbizTool API
	const formData = new URLSearchParams();
	Object.entries(body).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			formData.append(key, String(value));
		}
	});

	const options: IHttpRequestOptions = {
		method,
		url: `${credentials.baseUrl}${endpoint}`,
		body: formData.toString(),
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			...headers,
		},
		returnFullResponse: true,
	};

	try {
		const response = await this.helpers.httpRequest(options);
		
		// Parse the response as JSON
		let parsedResponse;
		try {
			parsedResponse = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
		} catch (parseError) {
			throw new NodeApiError(this.getNode(), {
				message: 'Failed to parse API response as JSON',
				description: `Response: ${response.body}`,
			});
		}

		// Check for API-level errors
		if (parsedResponse.status === 0) {
			throw new NodeApiError(this.getNode(), {
				message: parsedResponse.message || 'Unknown API error',
				description: `Status: ${parsedResponse.status}`,
				httpCode: response.statusCode?.toString(),
			});
		}

		return parsedResponse;

	} catch (error: any) {
		// Handle different types of errors
		if (error.response) {
			// HTTP error with response
			let errorMessage = 'WbizTool API request failed';
			let errorDescription = '';

			try {
				const errorData = typeof error.response.body === 'string' ? JSON.parse(error.response.body) : error.response.body;
				errorMessage = errorData.message || errorMessage;
				errorDescription = `Status: ${errorData.status}, Code: ${error.response.statusCode}`;
			} catch (parseError) {
				errorDescription = `HTTP ${error.response.statusCode}: ${error.response.body}`;
			}

			throw new NodeApiError(this.getNode(), {
				message: errorMessage,
				description: errorDescription,
				httpCode: error.response.statusCode?.toString(),
			});
		}

		// Network or other errors
		throw new NodeApiError(this.getNode(), {
			message: error.message || 'Unknown error occurred',
			description: 'Check your network connection and API credentials',
		});
	}
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string, countryCode: string): { isValid: boolean; message?: string } {
	// Remove any non-digit characters
	const cleanPhone = phone.replace(/\D/g, '');
	const cleanCountryCode = countryCode.replace(/\D/g, '');

	if (!cleanCountryCode) {
		return { isValid: false, message: 'Country code is required' };
	}

	if (cleanPhone.length < 6 || cleanPhone.length > 15) {
		return { isValid: false, message: 'Phone number must be between 6 and 15 digits' };
	}

	if (cleanPhone.includes('$')) {
		return { isValid: false, message: 'Phone number contains invalid characters' };
	}

	return { isValid: true };
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string, countryCode: string): string {
	const cleanPhone = phone.replace(/\D/g, '');
	const cleanCountryCode = countryCode.replace(/\D/g, '');
	return `+${cleanCountryCode}${cleanPhone}`;
}

/**
 * Validate message type and required fields
 */
export function validateMessageParameters(messageType: string, params: any): { isValid: boolean; message?: string } {
	if (messageType === '0') {
		// Text message
		if (!params.message || !params.message.trim()) {
			return { isValid: false, message: 'Message text is required for text messages' };
		}
	} else if (messageType === '1') {
		// Image message
		if (!params.imageUrl || !params.imageUrl.trim()) {
			return { isValid: false, message: 'Image URL is required for image messages' };
		}
		if (!isValidUrl(params.imageUrl)) {
			return { isValid: false, message: 'Image URL must be a valid URL' };
		}
	} else if (messageType === '2') {
		// File message
		if (!params.fileUrl || !params.fileUrl.trim()) {
			return { isValid: false, message: 'File URL is required for file messages' };
		}
		if (!params.fileName || !params.fileName.trim()) {
			return { isValid: false, message: 'File name is required for file messages' };
		}
		if (!isValidUrl(params.fileUrl)) {
			return { isValid: false, message: 'File URL must be a valid URL' };
		}
	}

	return { isValid: true };
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
	try {
		new URL(urlString);
		return urlString.startsWith('http://') || urlString.startsWith('https://');
	} catch {
		return false;
	}
}

/**
 * Get rate limit delay based on plan
 */
export function getRateLimitDelay(planType?: string): number {
	// Return delay in milliseconds
	switch (planType?.toLowerCase()) {
		case 'free':
			return 6000; // 10 requests per minute = 6 second delay
		case 'paid':
		case 'premium':
			return 600; // 100 requests per minute = 0.6 second delay
		default:
			return 6000; // Default to free plan limits
	}
}

/**
 * Handle rate limiting with retry
 */
export async function handleRateLimit(
	this: IExecuteFunctions,
	requestFunction: () => Promise<any>,
	maxRetries: number = 3,
): Promise<any> {
	let lastError;
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await requestFunction();
		} catch (error: any) {
			lastError = error;
			
			// Check if it's a rate limit error
			if (error.httpCode === '429' || error.message.includes('rate limit')) {
				if (attempt < maxRetries) {
					const delay = getRateLimitDelay() * attempt; // Exponential backoff
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				}
			}
			
			// If it's not a rate limit error, throw immediately
			throw error;
		}
	}
	
	throw lastError;
} 