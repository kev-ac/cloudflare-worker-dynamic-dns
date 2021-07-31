# 👷 `cloudflare-worker-dynamic-dns`

**A small project to leverage the Cloudflare Workers and Cloudflare KV systems to provide a dynamic DNS service without the need to rely on third-party services.**

## Getting started

1. Make sure to create the following secrets before publishing the worker to your account:

- `ZONE_ID` - Your designated Cloudflare DNS zone
- `API_TOKEN` - A Cloudflare API token with "Edit DNS zone" scope.

2. Create a KV namespace and configure your wrangler.toml with the KV namespace ID **and** Account ID

3) Create users in your KV namespace that can access the update endpoint with the following scheme:

- `subdomains:{YOUR_USERNAME}:token` - ACCESSTOKEN of the user

4. Start using the worker:

- Send a **GET** request to {WORKER_URL}/update?ip={YOUR_DYNAMIC_IP} Basic Auth credentials in scheme {YOUR_USERNAME}:
  {ACCESSTOKEN}

## Known issues

- When a DNS record receives it's first update it takes a short time until the KV update is propagated through Cloudflare.
  As such it is possible that two different records will be created if IPs in consecutive requests don't match.

## Improving the Worker

If you think that this worker should be improving please feel free to create an Issue or pull request with your proposed changes.
