import { buildServer } from "./app";

const { config, server } = await buildServer();

if(config.transportType === "httpStream") {
	await server.start({
		transportType: "httpStream",
		httpStream: {
			host: config.httpHost,
			port: config.httpPort,
		},
	});
} else {
	await server.start({
		transportType: "stdio",
	});
}
