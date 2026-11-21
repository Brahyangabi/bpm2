const TARGET_RE = /^https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com\/?$/;

export async function onRequestGet({ request }) {
  const requested = new URL(request.url).searchParams.get('url') || '';
  if (!TARGET_RE.test(requested)) {
    return Response.json({ ok: false, error: 'invalid_url' }, { status: 400 });
  }

  try {
    // Do the probe server-side: a browser's no-cors request would also
    // succeed on Cloudflare's own 502 page when the tunnel origin is down.
    const upstream = await fetch(requested, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'cache-control': 'no-cache', 'range': 'bytes=0-0' },
      signal: AbortSignal.timeout(5000)
    });
    const ok = upstream.status >= 200 && upstream.status < 400;
    return Response.json({ ok, status: upstream.status }, {
      status: 200,
      headers: { 'cache-control': 'no-store' }
    });
  } catch (_) {
    return Response.json({ ok: false, error: 'upstream_unreachable' }, {
      status: 200,
      headers: { 'cache-control': 'no-store' }
    });
  }
}
