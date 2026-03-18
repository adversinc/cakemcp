import { describe, expect, test } from "bun:test";

import { buildGitAuth, buildGitCommand } from "../src/providers/git-registry-provider";

describe("buildGitAuth", () => {
	test("uses x-token-auth basic auth for Bitbucket token-only credentials", () => {
		const auth = buildGitAuth("https://bitbucket.org/acme/private-registry.git", "secret-token");

		expect(auth.mode).toBe("bitbucket-token");
		expect(auth.header).toBe(`Authorization: Basic ${Buffer.from("x-token-auth:secret-token").toString("base64")}`);
	});

	test("keeps bearer auth for non-Bitbucket token-only credentials", () => {
		const auth = buildGitAuth("https://github.com/acme/private-registry.git", "secret-token");

		expect(auth.mode).toBe("bearer");
		expect(auth.header).toBe("Authorization: Bearer secret-token");
	});
});

describe("buildGitCommand", () => {
	test("passes auth header through git config instead of an environment variable", () => {
		expect(buildGitCommand(["clone", "repo"], "Authorization: Basic abc")).toEqual([
			"git",
			"-c",
			"http.extraHeader=Authorization: Basic abc",
			"clone",
			"repo",
		]);
	});
});
