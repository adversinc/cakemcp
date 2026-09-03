import { buildServer } from "./app";
import { buildServerStartOptions } from "./server-start-options";

const { config, server } = await buildServer();

await server.start(buildServerStartOptions(config));
