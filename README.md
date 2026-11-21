# TryCloudflare redirect on Cloudflare Pages

This is the content for the separate Pages Git checkout at `~/bpm2page`. Put `index.html` and `currentURL.js` directly at that checkout's root, connect that repository to Cloudflare Pages, and use the checkout's production branch. Set the build command to **none** (or blank) and output directory to `.` (repository root).

Before redirecting to `window.CURRENT_URL` in `currentURL.js`, the page calls the same-origin `/api/health` Pages Function. The function checks the TryCloudflare URL from Cloudflare's side and only reports it healthy for an HTTP 2xx/3xx response. This avoids relying on a browser `no-cors` probe, which can look successful even when Cloudflare is returning its own origin-unreachable error page. If the Function successfully completes the probe and reports the tunnel unreachable, the page shows the Portuguese “Server Não Respondeu” message. If the Function itself errors, is unavailable, is quota-limited, or times out, the page fails open and redirects as if the URL were working.

Deploy the `functions/api/health.js` file along with `index.html` and `currentURL.js`; Cloudflare Pages detects it as a Pages Function automatically. The function only accepts `https://<name>.trycloudflare.com` targets.

## Local folder layout

```text
~/
├── start-pages-tunnel.sh
├── bpm2page/                                  # separate Git checkout for Pages
│   ├── index.html
│   ├── currentURL.js
│   └── functions/
│       └── api/health.js
└── blockpostserver-arena-7b03b81c-blockpostserver/
    └── bpm2-web/
        └── RADMIN.sh
```

Copy this folder's two site files into the root of the Pages checkout, and copy the script from the Blockpost checkout to `~/start-pages-tunnel.sh`. Then run `~/start-pages-tunnel.sh`.

The script starts `RADMIN.sh` in all-modes mode (it also feeds the mode/window selections to support older interactive checkouts), waits for port 8216, starts Cloudflare Tunnel via Docker, writes the assigned `trycloudflare.com` URL into `~/bpm2page/currentURL.js`, then commits and pushes that file to the current branch of the Pages checkout. The script shows compact progress indicators for `Starting Server`, `Starting Tunnel`, and `Updating bpm2page` instead of streaming command logs. After startup, it offers `1) Restart server` and `2) Close server and tunnel`. Restart keeps the same tunnel URL and stops/relaunches the full BPM2 process group; close shuts down the server and tunnel. Ctrl-C also stops both.

Requirements: Docker, Git authentication for the Pages checkout's `origin`, a configured Cloudflare Pages project, and `sudo` access if the current user cannot access Docker directly. The tunnel URL is publicly reachable while the tunnel is running. Pages deployment takes a short time after the push. Override the defaults with `BPM2_REPO` and `BPM2_PAGES_REPO` if your checkout paths differ.
