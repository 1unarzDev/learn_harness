import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { it } from "node:test";
import { createModels, normalizeContext } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { withServerProviderEndpoint } from "../src/agent/server-provider-endpoint.ts";

it("routes both native API-key transports to the server endpoints", async () => {
	const requests: { path?: string; auth?: string; key?: string; parallel?: boolean }[] = [];
	const server = createServer((req, res) => {
		let body = "";
		req.on("data", chunk => { body += chunk; });
		req.on("end", () => {
			requests.push({ path: req.url, auth: req.headers.authorization, key: req.headers["x-api-key"] as string | undefined, parallel: JSON.parse(body).parallel_tool_calls });
			res.writeHead(400, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: { message: "endpoint test", type: "invalid_request_error" } }));
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const base = `http://127.0.0.1:${address.port}`;
	try {
		for (const [id, modelId, endpoint] of [
			["anthropic", "claude-haiku-5-5", base],
			["openai", "gpt-6.1-sol", `${base}/v1`],
		]) {
			const native = builtinProviders().find(p => p.id === id)!;
			const models = createModels({ credentials: {
				read: async () => ({ type: "api_key", key: "test-server-routing-key" }),
				list: async () => [], modify: async () => undefined, delete: async () => {},
			} });
			const provider = withServerProviderEndpoint(native, endpoint);
			assert.equal(provider.auth.oauth, native.auth.oauth, "OAuth transport remains native");
			models.setProvider(provider);
			const model = models.getModel(id!, modelId!)!;
			assert.ok(model);
			for (const stream of [models.streamSimple.bind(models), models.stream.bind(models)]) {
				for (const replacePayload of [false, true]) {
					await stream(model, {
						messages: [{ role: "user", content: "test", timestamp: 0 }],
						tools: [{ name: "echo", description: "Echo", parameters: { type: "object", properties: {} } }],
					}, {
						maxRetries: 0,
						onPayload: replacePayload ? async raw => ({ ...raw as object, parallel_tool_calls: true }) : undefined,
					}).result();
				}
			}
		}
		assert.deepEqual(requests, [
			...Array.from({ length: 4 }, (_, index) => ({ path: "/v1/messages?beta=true", auth: undefined, key: "test-server-routing-key", parallel: index % 2 === 0 ? undefined : true })),
			...Array.from({ length: 4 }, () => ({ path: "/v1/responses", auth: "Bearer test-server-routing-key", key: undefined, parallel: false })),
		]);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});

it("rejects unsafe endpoint configuration and preserves unconfigured providers", () => {
	const provider = builtinProviders().find(p => p.id === "anthropic")!;
	assert.equal(withServerProviderEndpoint(provider), provider);
	for (const endpoint of ["file:///tmp/provider", "https://key@example.com", "https://example.com?key=secret", "https://example.com#fragment"]) {
		assert.throws(() => withServerProviderEndpoint(provider, endpoint));
	}
});

it("leaves native OpenAI transport options unchanged outside the server endpoint", () => {
	const native = builtinProviders().find(p => p.id === "openai")!;
	const options = { samplingParams: { parallel_tool_calls: true } };
	const provider = withServerProviderEndpoint({
		...native,
		streamSimple(_model, _context, actualOptions) {
			assert.equal(actualOptions, options);
			throw new Error("native transport reached");
		},
	}, "http://127.0.0.1:2455/v1");
	assert.throws(() => provider.streamSimple(native.getModels()[0]!, normalizeContext({ messages: [] }), options), /native transport reached/);
});
