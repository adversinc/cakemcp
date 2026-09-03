import type { AppConfig } from "./config";

type TransportConfig = Pick<AppConfig, "httpHost" | "httpPort" | "transportType">;

/** Builds transport startup options without creating persistent HTTP sessions. */
export function buildServerStartOptions(config: TransportConfig) {
	if(config.transportType === "httpStream") {
		return {
			transportType: "httpStream" as const,
			httpStream: {
				host: config.httpHost,
				port: config.httpPort,
				// The server has no session-scoped state. Stateful transports retain
				// abandoned sessions and their in-memory event stores indefinitely.
				stateless: true,
			},
		};
	}

	return {
		transportType: "stdio" as const,
	};
}
