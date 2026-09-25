import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { WebAuth, hasViewerRole } from "../src/web/auth";
import type { SsoProvider, WebConfig } from "../src/web/config";

let issuerServer: Bun.Server<undefined>;
let issuer: string;
let privateKey: CryptoKey;
let otherKey: CryptoKey;
const codes = new Map<string, { nonce: string; challenge: string; mode: string }>();
const clientId = "viewer-client";

beforeAll(async () => {
	const pair = await generateKeyPair("RS256");
	privateKey = pair.privateKey;
	otherKey = (await generateKeyPair("RS256")).privateKey;
	const jwk = { ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
	issuerServer = Bun.serve({ hostname: "127.0.0.1", port: 0, /**
	 *
	 */
		async fetch(request) {
			const url = new URL(request.url);
			if(url.pathname === "/.well-known/openid-configuration") return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: ["client_secret_post"], code_challenge_methods_supported: ["S256"] });
			if(url.pathname === "/jwks") return Response.json({ keys: [jwk] });
			if(url.pathname !== "/token") return new Response(null, { status: 404 });
			const form = new URLSearchParams(await request.text());
			const entry = codes.get(form.get("code") ?? "");
			codes.delete(form.get("code") ?? "");
			if(!entry || createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== entry.challenge || form.get("client_secret") !== "test-secret") return Response.json({ error: "invalid_grant" }, { status: 400 });
			const { mode, nonce } = entry;
			const token = await new SignJWT({ nonce: mode === "nonce" ? "wrong" : nonce, name: "Test Viewer", [`urn:zitadel:iam:org:project:${mode === "project" ? "999" : "123"}:roles`]: { [mode === "role" ? "other-role" : "cakemcp-viewer"]: { "org-1": "example.com" } } })
				.setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("user-1")
				.setIssuer(mode === "issuer" ? "https://wrong.example" : issuer).setAudience(mode === "audience" ? "wrong-client" : clientId)
				.setIssuedAt().setExpirationTime(mode === "expired" ? "-1h" : "5m").sign(mode === "signature" ? otherKey : privateKey);
			return Response.json({ access_token: "unused-access-token", token_type: "Bearer", expires_in: 300, id_token: token });
		} });
	issuer = `http://127.0.0.1:${issuerServer.port}`;
});
afterAll(() => issuerServer?.stop(true));

/** Constructs a two-provider setup against an isolated local OIDC authority. */
function settings(): Extract<WebConfig, { enabled: true }> {
	const base = { name: "Test SSO", issuer, clientId, clientSecret: "test-secret", clientSecretEnv: "TEST_SECRET", projectId: "123", requiredRole: "cakemcp-viewer" };
	return { enabled: true, port: 8081, host: "127.0.0.1", baseUrl: "http://localhost:8081", sessionSecret: "test-only-key-with-at-least-32-bytes", providers: [{ ...base, id: "one" }, { ...base, id: "two" }] };
}

/** Completes the actual code exchange against a signed-token provider. */
async function login(auth: WebAuth, id = "one", mode = "valid") {
	const start = await auth.handle(new Request(`http://localhost:8081/auth/login/${id}`), `/auth/login/${id}`);
	const location = new URL(start.headers.get("location")!);
	const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
	const code = crypto.randomUUID();
	codes.set(code, { nonce: location.searchParams.get("nonce")!, challenge: location.searchParams.get("code_challenge")!, mode });
	const state = mode === "state" ? "wrong" : location.searchParams.get("state")!;
	const callbackId = mode === "provider" ? "two" : id;
	return auth.handle(new Request(`http://localhost:8081/auth/callback/${callbackId}?code=${code}&state=${state}`, { headers: { cookie } }), `/auth/callback/${callbackId}`);
}

describe("viewer OIDC authentication", () => {
	test("both configured providers complete PKCE login and create token-free sessions", async () => {
		for(const id of ["one", "two"]) {
			const auth = new WebAuth(settings());
			const response = await login(auth, id);
			expect(response.headers.get("location")).toBe("/projects");
			const cookie = response.headers.getSetCookie().find(value => value.startsWith("cakemcp-session="))!;
			expect(cookie).toContain("HttpOnly");
			expect(cookie).toContain("SameSite=Lax");
			const viewer = await auth.viewer(new Request("http://localhost:8081/api/catalog", { headers: { cookie: cookie.split(";")[0]! } }));
			expect(viewer?.providerId).toBe(id);
			expect(viewer?.subject).toBe("user-1");
			const payload = await auth.unseal(cookie.split(";")[0]!.slice("cakemcp-session=".length), "session");
			expect(JSON.stringify(payload)).not.toContain("token");
		}
	});
	test("rejects missing project roles and all invalid identity or transaction checks", async () => {
		for(const mode of ["role", "project", "issuer", "audience", "expired", "signature", "nonce", "state", "provider"]) {
			const response = await login(new WebAuth(settings()), "one", mode);
			expect(response.headers.get("location")).toStartWith("/login?error=");
			expect(response.headers.getSetCookie().some(value => value.startsWith("cakemcp-session="))).toBe(false);
		}
	});
	test("encrypted sessions survive replicas but reject expiry, tampering and policy changes", async () => {
		const auth = new WebAuth(settings());
		const sealed = await auth.seal({ subject: "user-1" }, "session", 3600);
		expect((await new WebAuth(settings()).unseal(sealed, "session"))?.subject).toBe("user-1");
		expect(await auth.unseal(`${sealed.slice(0, -8)}AAAAAAAA`, "session")).toBeUndefined();
		expect(await auth.unseal(sealed, "login")).toBeUndefined();
		expect(await auth.unseal(await auth.seal({}, "session", -1), "session")).toBeUndefined();
		const changed = settings(); changed.providers[0]!.requiredRole = "different";
		expect(await new WebAuth(changed).unseal(sealed, "session")).toBeUndefined();
	});
	test("requires same-origin POST for logout and clears both cookies", async () => {
		const auth = new WebAuth(settings());
		expect((await auth.handle(new Request("http://localhost:8081/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }), "/auth/logout")).status).toBe(403);
		const response = await auth.handle(new Request("http://localhost:8081/auth/logout", { method: "POST", headers: { origin: "http://localhost:8081" } }), "/auth/logout");
		expect(response.status).toBe(200);
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(response.headers.getSetCookie().every(value => value.includes("Max-Age=0"))).toBe(true);
	});
	test("does not accept generic or empty project role claims", () => {
		const provider = settings().providers[0] as SsoProvider;
		expect(hasViewerRole({ "urn:zitadel:iam:org:project:roles": { "cakemcp-viewer": { org: "example.com" } } }, provider)).toBe(false);
		expect(hasViewerRole({ "urn:zitadel:iam:org:project:123:roles": { "cakemcp-viewer": {} } }, provider)).toBe(false);
	});
});
