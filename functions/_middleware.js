// Cloudflare Pages reverse proxy for the BPM2 server.
// The launcher updates ORIGIN whenever the tunnel hostname changes.
const ORIGIN = "https://enjoying-mapping-palmer-webshots.trycloudflare.com";
const ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.trycloudflare\.com|[a-z0-9-]+\.[a-z0-9-]+\.ts\.net)$/i;

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
  "content-length", "cf-connecting-ip", "cf-ipcountry", "cf-ray",
  "cf-visitor", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto",
  "x-real-ip",
]);

function allowedOrigin(value) {
  if (typeof value !== "string" || !ORIGIN_RE.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch (_) {
    return null;
  }
}

function cleanHeaders(source, origin, { websocket = false } = {}) {
  const headers = new Headers();
  for (const [name, value] of source) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    headers.set(name, value);
  }
  if (websocket) {
    // Forward the browser's handshake unchanged; the game relay validates the
    // key, version, and Connection: Upgrade fields before it accepts /ws/<port>.
    headers.set("Connection", "Upgrade");
    headers.set("Upgrade", "websocket");
  }
  // The origin server sees its own host/origin, while the visitor stays on Pages.
  if (source.has("Origin")) headers.set("Origin", origin);
  const referer = source.get("Referer");
  if (referer) {
    try {
      const ref = new URL(referer);
      headers.set("Referer", origin + ref.pathname + ref.search + ref.hash);
    } catch (_) {}
  }
  return headers;
}

function proxyLocation(value, tunnelOrigin, publicOrigin) {
  if (!value) return value;
  try {
    const location = new URL(value, tunnelOrigin);
    if (location.origin === tunnelOrigin) return publicOrigin + location.pathname + location.search + location.hash;
  } catch (_) {}
  return value;
}

export async function onRequest(context) {
  const { request } = context;
  const tunnelOrigin = allowedOrigin(ORIGIN);
  if (!tunnelOrigin) return context.next();

  const incoming = new URL(request.url);
  const destination = new URL(tunnelOrigin);
  destination.pathname = incoming.pathname;
  destination.search = incoming.search;
  const upgrade = request.headers.get("Upgrade");

  try {
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      const upstream = await fetch(destination.toString(), {
        method: "GET",
        headers: cleanHeaders(request.headers, tunnelOrigin, { websocket: true }),
      });
      const upstreamSocket = upstream.webSocket;
      console.log("Pages WS upstream handshake", upstream.status, Boolean(upstreamSocket));
      if (!upstreamSocket) {
        return new Response("Tunnel upstream did not accept WebSocket", {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        });
      }

      // This is a transparent one-to-one proxy: transfer the accepted upstream
      // socket directly to the browser. Do not call accept() here; accepting it
      // makes the Worker own the socket, so frames then require a second relay
      // endpoint and can be silently stranded. The initial implementation did
      // exactly that, which explains the 101 handshake followed by no reply.
      return new Response(null, { status: 101, webSocket: upstreamSocket });
    }

    const headers = cleanHeaders(request.headers, tunnelOrigin);
    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

    const upstream = await fetch(destination.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection", "alt-svc"]) {
      responseHeaders.delete(name);
    }
    const location = responseHeaders.get("Location");
    if (location) responseHeaders.set("Location", proxyLocation(location, tunnelOrigin, incoming.origin));

    // Cookies scoped to the tunnel hostname must become host-only cookies on Pages.
    if (typeof upstream.headers.getSetCookie === "function") {
      responseHeaders.delete("set-cookie");
      for (const cookie of upstream.headers.getSetCookie()) {
        responseHeaders.append("set-cookie", cookie.replace(/;\s*domain=[^;]*/ig, ""));
      }
    }

    const allowOrigin = responseHeaders.get("Access-Control-Allow-Origin");
    if (allowOrigin === tunnelOrigin) responseHeaders.set("Access-Control-Allow-Origin", incoming.origin);
    responseHeaders.set("Cache-Control", responseHeaders.get("Cache-Control") || "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response("BPM2 tunnel upstream unavailable", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
