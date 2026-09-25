import { expect, test } from "bun:test";
import { RegistryUnavailableError } from "../src/errors";
import { describeRegistryError } from "../src/web/errors";
import { createWebHandler } from "../src/web/server";
import type { WebDependencies } from "../src/web/data";

const authenticationError = new RegistryUnavailableError("Clone failed: https://user:private-token@example.com/private.git", {
	stderr: "fatal: could not read Password for 'https://user:private-token@example.com': terminal prompts disabled",
});

test("Git authentication and local layout failures have actionable, sanitized messages", () => {
	const failure = describeRegistryError(authenticationError, "git");
	expect(failure.code).toBe("registry_authentication_failed");
	expect(failure.error).toContain("REGISTRY_KEY");
	for(const value of ["private-token", "example.com", "user:"]) expect(JSON.stringify(failure)).not.toContain(value);
	expect(describeRegistryError({ code: "ENOENT", path: "/private/location" }, "local").code).toBe("registry_layout_invalid");
	expect(describeRegistryError({ code: "EACCES" }, "local").code).toBe("registry_permission_denied");
});

test("catalog and Registry page report the same safe authentication failure", async () => {
	const fail = async () => { throw authenticationError; };
	const deps = { repository: { listLayers: fail }, provider: { type: "git", getRootPath: fail } } as unknown as WebDependencies;
	const handler = createWebHandler({ enabled: true, host: "127.0.0.1", port: 8081, providers: [] }, deps);
	const response = await handler(new Request("http://localhost/api/catalog"));
	expect(response.status).toBe(503);
	const failure = await response.json() as{ code: string; error: string };
	expect(failure.code).toBe("registry_authentication_failed");
	const status = await (await handler(new Request("http://localhost/api/registry"))).json() as{ available: boolean; code: string };
	expect(status.available).toBe(false);
	expect(status.code).toBe(failure.code);
});
