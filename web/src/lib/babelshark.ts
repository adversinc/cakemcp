import { nextTick } from "vue";
import type { Session } from "./api";

declare global {
	interface Window {
		babelSharkConfig?: { projectId: number; accessCode: string; detectLanguage: boolean; onLoaded?: () => void };
	}
}

/** Loads BabelShark once, only when both public embed credentials are configured. */
export async function setupBabelShark(config: Session["babelshark"]) {
	if(!config || document.getElementById("babelshark-embed")) return;
	await nextTick();
	window.babelSharkConfig = { ...config, detectLanguage: false };
	const script = document.createElement("script");
	script.id = "babelshark-embed";
	script.src = "https://cdn.babelshark.net/static/babelshark-embed/babelshark.js";
	script.defer = true;
	document.head.appendChild(script);
}
