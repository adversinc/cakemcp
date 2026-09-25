/** Uses the server-provided base URL so one build works under any configured prefix. */
export const basePath = new URL(document.querySelector("base")?.href ?? `${location.origin}/`).pathname.replace(/\/$/, "");
export const webPath = (path: string) => `${basePath}${path}`;
