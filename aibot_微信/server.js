"use strict";

const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.WECHAT_H5_PORT || 3100);
const UPSTREAM_URL = (process.env.WINE_ADVISOR_UPSTREAM_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const PUBLIC_BASE_URL = (process.env.WECHAT_H5_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.WECHAT_H5_REQUEST_TIMEOUT_MS || 30000);
const TRUST_PROXY_PROTO = process.env.WECHAT_H5_TRUST_PROXY_PROTO || "";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function appendForwardedValue(existingValue, nextValue) {
  if (!existingValue) {
    return nextValue;
  }
  return `${existingValue}, ${nextValue}`;
}

function getRequestProto(req) {
  if (TRUST_PROXY_PROTO) {
    return TRUST_PROXY_PROTO;
  }
  return req.socket.encrypted ? "https" : "http";
}

function buildUpstreamHeaders(req, upstreamUrl) {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "host" || HOP_BY_HOP_HEADERS.has(lowerKey)) {
      return;
    }

    if (typeof value === "string") {
      headers.set(lowerKey, value);
      return;
    }

    if (Array.isArray(value) && value.length > 0) {
      headers.set(lowerKey, value.join(", "));
    }
  });

  const originalHost = req.headers.host || `127.0.0.1:${PORT}`;
  const originalPort = originalHost.includes(":")
    ? originalHost.split(":")[1]
    : getRequestProto(req) === "https"
      ? "443"
      : "80";
  const remoteAddress = req.socket.remoteAddress || "";

  headers.set("host", upstreamUrl.host);
  headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-port", originalPort);
  headers.set("x-forwarded-proto", getRequestProto(req));

  if (remoteAddress) {
    headers.set(
      "x-forwarded-for",
      appendForwardedValue(headers.get("x-forwarded-for"), remoteAddress)
    );
  }

  return headers;
}

function rewriteLocationHeader(locationValue, currentOrigin) {
  if (!locationValue) {
    return locationValue;
  }

  if (PUBLIC_BASE_URL && locationValue.startsWith(UPSTREAM_URL)) {
    return `${PUBLIC_BASE_URL}${locationValue.slice(UPSTREAM_URL.length)}`;
  }

  if (locationValue.startsWith(UPSTREAM_URL)) {
    return `${currentOrigin}${locationValue.slice(UPSTREAM_URL.length)}`;
  }

  return locationValue;
}

function buildClientHeaders(response, currentOrigin) {
  const headers = {};

  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey === "content-encoding") {
      return;
    }

    headers[key] = lowerKey === "location" ? rewriteLocationHeader(value, currentOrigin) : value;
  });

  if (typeof response.headers.getSetCookie === "function") {
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length > 0) {
      headers["Set-Cookie"] = setCookies;
    }
  }

  return headers;
}

async function proxyRequest(req, res, currentUrl) {
  const upstreamUrl = new URL(currentUrl.pathname + currentUrl.search, `${UPSTREAM_URL}/`);
  const currentOrigin = `${getRequestProto(req)}://${req.headers.host || `127.0.0.1:${PORT}`}`;
  const headers = buildUpstreamHeaders(req, upstreamUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const init = {
      method: req.method,
      headers,
      redirect: "manual",
      signal: controller.signal,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await readRequestBody(req);
      if (body.length > 0) {
        init.body = body;
      }
    }

    const response = await fetch(upstreamUrl, init);
    const responseHeaders = buildClientHeaders(response, currentOrigin);
    const buffer = Buffer.from(await response.arrayBuffer());

    res.writeHead(response.status, responseHeaders);
    res.end(buffer);
  } catch (error) {
    const isTimeout = error && typeof error === "object" && error.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      message: isTimeout
        ? "The existing Wine Advisor upstream did not respond in time."
        : "Unable to reach the existing Wine Advisor upstream.",
      detail: error instanceof Error ? error.message : "Unknown error",
      upstream: UPSTREAM_URL,
      timeout_ms: REQUEST_TIMEOUT_MS,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const currentUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "GET" && currentUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "aibot-wechat",
      upstream_url: UPSTREAM_URL,
      public_base_url: PUBLIC_BASE_URL || null,
      request_timeout_ms: REQUEST_TIMEOUT_MS,
    });
    return;
  }

  if (req.method === "GET" && currentUrl.pathname === "/ready") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, 5000));

    try {
      const response = await fetch(new URL("/", `${UPSTREAM_URL}/`), {
        method: "GET",
        signal: controller.signal,
      });

      sendJson(res, response.ok ? 200 : 503, {
        ok: response.ok,
        service: "aibot-wechat",
        upstream_url: UPSTREAM_URL,
        upstream_status: response.status,
      });
    } catch (error) {
      sendJson(res, 503, {
        ok: false,
        service: "aibot-wechat",
        upstream_url: UPSTREAM_URL,
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  await proxyRequest(req, res, currentUrl);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[aibot-wechat] listening on http://127.0.0.1:${PORT}`);
  console.log(`[aibot-wechat] mirroring upstream ${UPSTREAM_URL}`);
  if (PUBLIC_BASE_URL) {
    console.log(`[aibot-wechat] public base ${PUBLIC_BASE_URL}`);
  }
  console.log(`[aibot-wechat] request timeout ${REQUEST_TIMEOUT_MS}ms`);
});
