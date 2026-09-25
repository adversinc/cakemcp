import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { readWebConfig, readWebDocument } from "../src/web/config";

const enabled = { WEB_UI_ENABLED: "true", WEB_UI_PORT: "8081" };
const provider = { id: "one", name: "One", issuer: "https://example.com", clientId: "client", clientSecretEnv: "SSO_SECRET", projectId: "123", requiredRole: "cakemcp-viewer" };

describe("Web UI configuration", () => {
	test("validates and normalizes the runtime mount path", () => {
		for(const [value, expected] of [[undefined, ""], ["/", ""], ["/browse/", "/browse"], ["/tools/browse", "/tools/browse"]]) {
			const config = readWebConfig({ ...enabled, WEB_UI_BASE_PATH: value }, "stdio", 8080);
			expect(config.enabled && config.basePath).toBe(expected);
		}
		for(const value of ["browse", "//", "/../browse", "/browse?x", "/browse#x", "/%62rowse", "/a//b", '/a"b']) {
			expect(() => readWebConfig({ ...enabled, WEB_UI_BASE_PATH: value }, "stdio", 8080)).toThrow("WEB_UI_BASE_PATH");
		}
	});
	test("disabled by default, ignores unused settings, and requires a distinct valid port when enabled", () => {
		expect(readWebConfig({ WEB_UI_CONFIG: "{broken" }, "stdio", 8080)).toEqual({ enabled: false });
		for(const port of [undefined, "", "0", "65536", "42.5", "8081oops", "-1"]) {
			expect(() => readWebConfig({ ...enabled, WEB_UI_PORT: port }, "stdio", 8080)).toThrow("WEB_UI_PORT");
		}
		expect(() => readWebConfig({ ...enabled, WEB_UI_PORT: "8080" }, "httpStream", 8080)).toThrow("differ");
		expect(readWebConfig({ ...enabled, WEB_UI_PORT: "8080" }, "stdio", 8080).enabled).toBe(true);
	});
	test("missing configuration and an empty provider array deliberately enable public access", () => {
		for(const value of [undefined, "", "{}", '{"sso":{"providers":[]}}']) {
			const config = readWebConfig({ ...enabled, WEB_UI_CONFIG: value }, "stdio", 8080);
			expect(config.enabled && config.providers).toEqual([]);
		}
	});
	test("loads literal JSON, absolute paths, relative paths and secret-mount symlinks", () => {
		const dir = mkdtempSync(join(tmpdir(), "cakemcp-config-"));
		try {
			const content = '{"sso":{"providers":[]}}';
			writeFileSync(join(dir, "config.json"), content);
			symlinkSync(join(dir, "config.json"), join(dir, "mounted.json"));
			for(const value of [content, join(dir, "config.json"), relative(process.cwd(), join(dir, "config.json")), join(dir, "mounted.json")]) expect(readWebDocument(value)).toEqual({ sso: { providers: [] } });
			expect(() => readWebDocument(dir)).toThrow("regular JSON file");
			writeFileSync(join(dir, "config.json"), "{broken");
			expect(() => readWebDocument(join(dir, "config.json"))).toThrow();
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
	test("never falls back to public access for malformed or unsafe explicit configuration", () => {
		for(const value of ["{oops", "[oops", "[]", "null", "true", '"filename.json"', "42", '{"typo":1}', "https://example.com/config", "file:///tmp/a", "/tmp/no-such-cakemcp-config", "bad\u0000path", "a\nb"]) expect(() => readWebDocument(value)).toThrow();
	});
	test("validates providers, environment secrets, base URL and shared session key", () => {
		const env = { ...enabled, WEB_UI_CONFIG: JSON.stringify({ sso: { providers: [provider] } }), WEB_UI_BASE_URL: "https://viewer.example.com", WEB_UI_SESSION_SECRET: "a".repeat(32), SSO_SECRET: "secret" };
		const result = readWebConfig(env, "stdio", 8080);
		expect(result.enabled && result.providers[0]?.clientSecret).toBe("secret");
		for(const overrides of [{ SSO_SECRET: "" }, { WEB_UI_SESSION_SECRET: "short" }, { WEB_UI_BASE_URL: "http://remote.example" }, { WEB_UI_BASE_URL: "https://viewer.example.com/subpath" }, { WEB_UI_BASE_URL: "http://localhost:8081", NODE_ENV: "production" }, { WEB_UI_CONFIG: JSON.stringify({ sso: { providers: [provider, provider] } }) }]) expect(() => readWebConfig({ ...env, ...overrides }, "stdio", 8080)).toThrow();
	});
	test("enables BabelShark only when both credentials are present", () => {
		for(const extra of [{}, { BABELSHARK_PROJECT_ID: "1" }, { BABELSHARK_ACCESS_CODE: "public" }]) {
			const config = readWebConfig({ ...enabled, ...extra }, "stdio", 8080);
			expect(config.enabled && config.babelshark).toBeUndefined();
		}
		const config = readWebConfig({ ...enabled, BABELSHARK_PROJECT_ID: "123", BABELSHARK_ACCESS_CODE: "public" }, "stdio", 8080);
		expect(config.enabled && config.babelshark).toEqual({ projectId: 123, accessCode: "public" });
	});
});
