# Internal services page

A static, dependency-free page listing the services on the Tailscale tailnet. GitHub Pages serves it over HTTPS, which is what lets the **Copy** buttons use `navigator.clipboard.writeText()` (the Clipboard API requires a secure context).

## Connection status

The dot at the top checks Tailscale DNS: the page sends a `no-cors` request to the first URL in `services.json`. A response means the MagicDNS name resolved — green dot, "connected". A network error means it did not — red dot, "not connected to tailscale VPN". The check repeats every 15 seconds and whenever the tab becomes visible again.

This is a reachability probe, so a powered-off first service also shows red. Chrome 142+ classifies Tailscale's `100.x` addresses as local-network destinations and blocks automatic requests from a public page until you allow "Local network" access for this site in the browser's site settings. Firefox does not apply that restriction.

## Editing the list

Edit `services.json`. Each entry:

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Service name shown as the link text |
| `url` | yes | Full URL, copied by the button and used by the link |

Replace the `<tailnet>` placeholders with your real MagicDNS names. Add, remove or reorder entries freely — the page reads the file on every load.

## Testing locally (optional)

No local server is needed for the real deployment — push to `main` and check the GitHub Pages site. For a preview before pushing, run this from the repository root:

```sh
bunx serve pages -l 8000
```

Then open <http://localhost:8000>. `localhost` counts as a secure context, so the Copy buttons work. `bunx` fetches the small `serve` package on first use and caches it; nothing is added to `package.json`. Opening `index.html` as a `file://` URL will not work: `fetch` is blocked and the Clipboard API is unavailable.

## Deploying

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The workflow at `.github/workflows/deploy-pages.yml` publishes this folder on every push to `main` that touches `pages/`. The page then lives at `https://<owner>.github.io/<repo>/`. All asset paths are relative, so it works under that subpath.

> Note: a GitHub Pages site on a free plan is public. This page reveals the names and URLs of internal services (not their contents). Only list what you are comfortable publishing; keep secrets out of `services.json`.
