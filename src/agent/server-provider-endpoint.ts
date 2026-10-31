import type { Model, Api, Provider, StreamOptions } from "@earendil-works/pi-ai";

/** Responses-Lite rejects omitted/true parallel_tool_calls, including inline tools. */
function sequentialToolPayload(onPayload: StreamOptions["onPayload"]): NonNullable<StreamOptions["onPayload"]> {
	return async (raw, model) => {
		const replacement = await onPayload?.(raw, model);
		const payload = replacement === undefined ? raw : replacement;
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			throw new Error("Server Responses payload must be an object");
		}
		return { ...payload, parallel_tool_calls: false };
	};
}

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
	// Models applies API-key endpoint overrides before dispatch. Native OAuth
	// requests keep their own URL and must not acquire server routing policy.
	const serverResponses = (model: Model<Api>) => provider.id === "openai"
		&& model.api === "openai-responses" && model.baseUrl === baseUrl;
	return {
		...provider,
		stream(model, context, options) {
			return provider.stream<Api>(model, context, serverResponses(model)
				? { ...options, onPayload: sequentialToolPayload(options?.onPayload) } : options);
		},
		streamSimple(model, context, options) {
			return provider.streamSimple(model, context, serverResponses(model)
				? { ...options, onPayload: sequentialToolPayload(options?.onPayload) } : options);
		},
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
