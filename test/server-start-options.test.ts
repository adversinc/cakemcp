import { describe, expect, test } from "bun:test";

import { buildServerStartOptions } from "../src/server-start-options";

describe("buildServerStartOptions", () => {
	test("starts HTTP transport without retaining server-side sessions", () => {
		expect(buildServerStartOptions({
			httpHost: "127.0.0.1",
			httpPort: 8080,
			transportType: "httpStream",
		})).toEqual({
			transportType: "httpStream",
			httpStream: {
				host: "127.0.0.1",
				port: 8080,
				stateless: true,
			},
		});
	});

	test("keeps stdio startup options unchanged", () => {
		expect(buildServerStartOptions({
			httpHost: "127.0.0.1",
			httpPort: 8080,
			transportType: "stdio",
		})).toEqual({
			transportType: "stdio",
		});
	});
});
