// OCI HTTP Signature (Cavage version 10, as used by OCI APIs) implementation
// for Cloudflare Workers using the Web Crypto API.
//
// References:
// - https://docs.oracle.com/iaas/Content/API/Concepts/signingrequests.htm
// - https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-10

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
    .replace(/-----END [A-Z0-9 ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function sha256Base64(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return bytesToBase64(new Uint8Array(digest));
}

export interface OciSignOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  url: string;
  body?: string;
  privateKeyPem: string;
  tenancy: string;
  user: string;
  fingerprint: string;
}

export async function signOciRequest(opts: OciSignOptions): Promise<Record<string, string>> {
  const url = new URL(opts.url);
  const method = opts.method.toLowerCase();
  const requestTarget = `${method} ${url.pathname}${url.search}`;
  const date = new Date().toUTCString();

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(opts.privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedHeaders: string[] = ["(request-target)", "host", "date"];
  const signingLines: string[] = [
    `(request-target): ${requestTarget}`,
    `host: ${url.host}`,
    `date: ${date}`,
  ];
  const outHeaders: Record<string, string> = {
    host: url.host,
    date,
  };

  if (opts.body !== undefined && opts.body !== null) {
    const bodyHash = await sha256Base64(opts.body);
    const contentLength = String(new TextEncoder().encode(opts.body).byteLength);
    signedHeaders.push("x-content-sha256", "content-type", "content-length");
    signingLines.push(
      `x-content-sha256: ${bodyHash}`,
      `content-type: application/json`,
      `content-length: ${contentLength}`,
    );
    outHeaders["x-content-sha256"] = bodyHash;
    outHeaders["content-type"] = "application/json";
    outHeaders["content-length"] = contentLength;
  }

  const signingString = signingLines.join("\n");
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingString),
  );
  const sigB64 = bytesToBase64(new Uint8Array(sig));

  const keyId = `${opts.tenancy}/${opts.user}/${opts.fingerprint}`;
  outHeaders["authorization"] =
    `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",` +
    `headers="${signedHeaders.join(" ")}",signature="${sigB64}"`;

  return outHeaders;
}
