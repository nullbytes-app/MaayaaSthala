/**
 * Cloudflare Worker: proxy maayaasthala.nullbytes.app → Cloud Run
 * Handles both HTTP and WebSocket (wss://) connections.
 */

const CLOUD_RUN_HOST = "maayaasthala-942680040818.asia-south1.run.app";

export default {
  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return proxyWebSocket(request);
    }
    return proxyHTTP(request);
  }
};

async function proxyHTTP(request) {
  const url = new URL(request.url);
  const target = `https://${CLOUD_RUN_HOST}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("Host", CLOUD_RUN_HOST);
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

  return fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });
}

async function proxyWebSocket(request) {
  const url = new URL(request.url);
  // Cloudflare Workers fetch() uses https:// (not wss://) for WebSocket upgrades.
  // It detects the Upgrade header and returns a response with a .webSocket property.
  const target = `https://${CLOUD_RUN_HOST}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("Host", CLOUD_RUN_HOST);

  const upstreamResp = await fetch(target, { headers });
  const upstream = upstreamResp.webSocket;

  if (!upstream) {
    return new Response("Upstream WebSocket connection failed", { status: 502 });
  }

  const [client, proxy] = new WebSocketPair();

  upstream.accept();
  proxy.accept();

  upstream.addEventListener("message", ({ data }) => {
    try { proxy.send(data); } catch {}
  });
  proxy.addEventListener("message", ({ data }) => {
    try { upstream.send(data); } catch {}
  });

  upstream.addEventListener("close", ({ code, reason }) => {
    try { proxy.close(code, reason); } catch {}
  });
  proxy.addEventListener("close", ({ code, reason }) => {
    try { upstream.close(code, reason); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}
