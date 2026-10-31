# Server deployment

The instance at https://learn.liambray.dev runs on `creation` from this repository,
in `~/services/learn-harness`. Docker Compose binds the app to `127.0.0.1:3000`;
the existing Cloudflare Tunnel handles HTTPS. Cloudflare Access permits only
the owner's two email addresses, with a 30-day application and policy session.

## Deploy or update

```sh
ssh creation
cd ~/services/learn-harness
git pull --ff-only
docker buildx bake -f compose.yml --allow=network.host --load
docker compose up -d --no-build
docker compose ps
```

The container restarts automatically. Learning data, preferences, and app-managed
credentials persist in the `learn-harness-state` Docker volume mounted at `/state`.
Back up that volume before changing stored data or removing the deployment.
`docker compose down` preserves it; `docker compose down -v` deletes it.
Builds use host networking to follow the server's Cloudflare WARP DNS and routes.
The build command explicitly grants Bake's host-network entitlement.

The untracked `.env.server` file (mode 0600) contains `ANTHROPIC_API_KEY` for
better-ccflare and `OPENAI_API_KEY` for codex-lb. Keys are runtime-only and are
excluded from Git and the Docker build. They appear as environment-owned keys
in Settings. Model slots are intentionally left for the owner to choose.

The deployment uses these server-only settings for API-key requests:

| Variable | Destination |
| --- | --- |
| `LH_ANTHROPIC_BASE_URL` | `http://127.0.0.1:8081` (better-ccflare) |
| `LH_OPENAI_BASE_URL` | `http://127.0.0.1:2455/v1` (codex-lb Responses API) |

These variables leave native subscription OAuth routing unchanged. The built-in
OpenAI Responses route explicitly sets `parallel_tool_calls: false` because
codex-lb's Responses-Lite transport requires sequential tool calls, including
when the SDK embeds tool definitions in `additional_tools` input items.
The built-in
provider catalogs remain available; select models supported by the corresponding
load balancer. Chromium is installed for browser-backed agent tools.

## Inspect and restart

```sh
docker compose logs --tail=100
docker compose restart
curl -f http://127.0.0.1:3000/api/models
```

Untrusted requests to the public domain must redirect to Cloudflare Access,
including `/api/*`. Do not expose the origin port on a public interface.
