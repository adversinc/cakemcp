import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import * as oidc from "openid-client";
import type { SsoProvider, WebConfig } from "./config";
import { isLocalHttp } from "./config";

type EnabledConfig = Extract<WebConfig, { enabled: true }>;
export type Viewer = { name: string; subject: string; issuer: string; providerId: string };

/** Tests the project-specific Zitadel claim, never an unscoped role with the same name. */
export function hasViewerRole(claims: Record<string, unknown>, provider: SsoProvider): boolean {
	const value = claims[`urn:zitadel:iam:org:project:${provider.projectId}:roles`];
	const objects = Array.isArray(value) ? value : [value];
	return objects.some((roles) => {
		if(!roles || typeof roles !== "object") return false;
		const grant = (roles as Record<string, unknown>)[provider.requiredRole];
		return !!grant && typeof grant === "object" && !Array.isArray(grant) && Object.values(grant).some((domain) => typeof domain === "string" && domain.length > 0);
	});
}

/** Authenticates only the viewer; MCP keeps its independent authentication policy. */
export class WebAuth {
	private readonly clients = new Map<string, Promise<oidc.Configuration>>();
	private readonly key: Uint8Array;
	private readonly secure: boolean;
	private readonly sessionName: string;
	private readonly transactionName: string;
	private readonly policy: string;

	constructor(private readonly config: EnabledConfig) {
		this.key = createHash("sha256").update(config.sessionSecret ?? "unused-public-mode").digest();
		this.secure = !config.baseUrl || new URL(config.baseUrl).protocol === "https:";
		this.sessionName = this.secure ? "__Host-cakemcp-session" : "cakemcp-session";
		this.transactionName = this.secure ? "__Host-cakemcp-login" : "cakemcp-login";
		this.policy = createHash("sha256").update(JSON.stringify(config.providers.map(({ id, issuer, clientId, projectId, requiredRole }) => ({ id, issuer, clientId, projectId, requiredRole })))).digest("hex");
	}

	/** Encrypts short-lived session or login state; contains no provider tokens. */
	async seal(payload: JWTPayload, kind: string, seconds: number): Promise<string> {
		return new EncryptJWT({ ...payload, kind, policy: this.policy })
			.setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt()
			.setIssuer(this.config.baseUrl!).setAudience("cakemcp-web")
			.setExpirationTime(`${seconds}s`).encrypt(this.key);
	}

	/** Rejects tampered, expired, wrong-purpose and obsolete-policy cookies. */
	async unseal(token: string, kind: string): Promise<JWTPayload | undefined> {
		try {
			const { payload } = await jwtDecrypt(token, this.key, {
				issuer: this.config.baseUrl, audience: "cakemcp-web", keyManagementAlgorithms: ["dir"],
				contentEncryptionAlgorithms: ["A256GCM"], requiredClaims: ["iat", "exp"], maxTokenAge: kind === "login" ? "10m" : "1h",
			});
			return payload.kind === kind && payload.policy === this.policy ? payload : undefined;
		} catch{ return undefined; }
	}

	/** Reads a named cookie without trusting any client-supplied identity fields. */
	private readCookie(request: Request, name: string): string {
		return (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
	}

	/** Limits cookies to this host and removes them explicitly on logout. */
	private cookie(name: string, value: string, seconds: number): string {
		return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.secure ? "; Secure" : ""}`;
	}

	/** Returns a validated browser identity, or no authenticated session. */
	async viewer(request: Request): Promise<Viewer | undefined> {
		if(!this.config.providers.length) return undefined;
		const payload = await this.unseal(this.readCookie(request, this.sessionName), "session");
		const provider = this.config.providers.find((item) => item.id === payload?.providerId);
		if(!payload || !provider || payload.issuer !== provider.issuer || typeof payload.subject !== "string" || typeof payload.name !== "string") return undefined;
		return { name: payload.name, subject: payload.subject, issuer: provider.issuer, providerId: provider.id };
	}

	/** Fetches discovery lazily, isolating unavailable providers from other logins. */
	private client(provider: SsoProvider): Promise<oidc.Configuration> {
		let pending = this.clients.get(provider.id);
		if(!pending) {
			const issuer = new URL(provider.issuer);
			pending = oidc.discovery(issuer, provider.clientId, provider.clientSecret, oidc.ClientSecretPost(provider.clientSecret), {
				timeout: 10,
				execute: [oidc.enableNonRepudiationChecks, ...(isLocalHttp(issuer) ? [oidc.allowInsecureRequests] : [])],
			}).catch((error) => { this.clients.delete(provider.id); throw error; });
			this.clients.set(provider.id, pending);
		}
		return pending;
	}

	/** Handles provider selection, bound callbacks and same-origin logout. */
	async handle(request: Request, pathname: string): Promise<Response> {
		if(!this.config.providers.length) return Response.json({ error: "SSO is not configured." }, { status: 404 });
		if(pathname === "/auth/logout" && request.method === "POST") {
			if(request.headers.get("origin") !== this.config.baseUrl) return Response.json({ error: "Invalid origin." }, { status: 403 });
			const headers = new Headers();
			headers.append("Set-Cookie", this.cookie(this.sessionName, "", 0));
			headers.append("Set-Cookie", this.cookie(this.transactionName, "", 0));
			return Response.json({ ok: true }, { headers });
		}
		if(request.method !== "GET") return new Response(null, { status: 405 });
		const match = /^\/auth\/(login|callback)\/([a-z0-9_-]+)$/.exec(pathname);
		const provider = this.config.providers.find((item) => item.id === match?.[2]);
		if(!provider || !match) return new Response(null, { status: 404 });
		try {
			const client = await this.client(provider);
			const redirectUri = `${this.config.baseUrl}/auth/callback/${provider.id}`;
			if(match[1] === "login") {
				const verifier = oidc.randomPKCECodeVerifier();
				const nonce = oidc.randomNonce();
				const state = oidc.randomState();
				const url = oidc.buildAuthorizationUrl(client, {
					redirect_uri: redirectUri, response_type: "code", code_challenge_method: "S256",
					code_challenge: await oidc.calculatePKCECodeChallenge(verifier), nonce, state,
					scope: `openid profile urn:zitadel:iam:org:project:id:${provider.projectId}:aud urn:zitadel:iam:org:projects:roles`,
				});
				return new Response(null, { status: 302, headers: {
					Location: url.href,
					"Set-Cookie": this.cookie(this.transactionName, await this.seal({ verifier, nonce, state, providerId: provider.id }, "login", 600), 600),
				} });
			}
			const transaction = await this.unseal(this.readCookie(request, this.transactionName), "login");
			if(!transaction || transaction.providerId !== provider.id || typeof transaction.verifier !== "string" || typeof transaction.nonce !== "string" || typeof transaction.state !== "string") throw new Error("Invalid login state");
			const callbackUrl = new URL(redirectUri);
			callbackUrl.search = new URL(request.url).search;
			const tokens = await oidc.authorizationCodeGrant(client, callbackUrl, {
				pkceCodeVerifier: transaction.verifier, expectedNonce: transaction.nonce,
				expectedState: transaction.state, idTokenExpected: true,
			});
			const claims = tokens.claims();
			if(!claims || !hasViewerRole(claims, provider)) {
				return this.failedLogin("access_denied");
			}
			const viewer: Viewer = { subject: claims.sub, issuer: provider.issuer, providerId: provider.id, name: String(claims.name ?? claims.preferred_username ?? "Viewer").slice(0, 120) };
			const headers = new Headers({ Location: "/projects" });
			headers.append("Set-Cookie", this.cookie(this.sessionName, await this.seal(viewer, "session", 3600), 3600));
			headers.append("Set-Cookie", this.cookie(this.transactionName, "", 0));
			return new Response(null, { status: 302, headers });
		} catch{ return this.failedLogin("login_failed"); }
	}

	/** Uses fixed, non-sensitive error codes and always discards a failed transaction. */
	private failedLogin(code: string): Response {
		return new Response(null, { status: 302, headers: { Location: `/login?error=${code}`, "Set-Cookie": this.cookie(this.transactionName, "", 0) } });
	}
}
