import type { Provider } from "@earendil-works/pi-ai";

/** Deployment-only API-key routing. OAuth retains its provider-owned endpoint. */
export function withServerProviderEndpoint(provider: Provider, endpoint?: string): Provider {
	if (!endpoint?.trim()) return provider;
	const url = new URL(endpoint.trim());
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new Error(`Invalid server endpoint for ${provider.id}`);
	}
	const apiKey = provider.auth.apiKey;
	if (!apiKey) throw new Error(`Provider ${provider.id} does not support API-key routing`);
	const baseUrl = url.toString().replace(/\/+$/, "");
	return {
		...provider,
		auth: {
			...provider.auth,
			apiKey: {
				...apiKey,
				async resolve(context) {
					const result = await apiKey.resolve(context);
					return result ? { ...result, auth: { ...result.auth, baseUrl } } : undefined;
				},
			},
		},
	};
}
