import { buildServer } from "./app";
import { buildServerStartOptions } from "./server-start-options";

const application = await buildServer();
const { config, server, logger } = application;
let webServer: Bun.Server<undefined> | undefined;

let stopping = false;


/** Stops both listeners so containers and development processes exit cleanly. */
async function shutdown() {
	if(stopping) return;
	stopping = true;
	await Promise.allSettled([Promise.resolve(webServer?.stop(true)), server.stop()]);
	process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
	if(config.web.enabled) {
		const { startWebServer } = await import("./web/server");
		webServer = startWebServer(config.web, application);
		logger.info("Web UI started", { host: config.web.host, port: config.web.port, access: config.web.providers.length ? "sso" : "public" });
	}
	await server.start(buildServerStartOptions(config));
} catch(error) {
	await webServer?.stop(true);
	await server.stop();
	throw error;
}
