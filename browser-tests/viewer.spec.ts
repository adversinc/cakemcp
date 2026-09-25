import { expect, test } from "@playwright/test";

test("cross-references navigation, source links, missing targets and search", async ({ page }) => {
	await page.route("**/api/catalog", async route => {
		const response = await route.fetch();
		const data = await response.json();
		data.crossReferences = [
			{ sourceProjectIds: ["name-fallback", "dedupe-auto-layer"], layer: "global/formatting", targetProjectId: "billing-service", targetExists: true, line: 2, text: 'If needed, call "resolve_context" with project_id=billing-service. <script>alert(1)</script>' },
			{ sourceProjectIds: [], layer: "global/formatting", targetProjectId: "missing", targetExists: false, line: 3, text: "resolve_context project_id=missing" },
		];
		await route.fulfill({ response, json: data });
	});
	await page.goto("/projects");
	await page.getByRole("link", { name: "Cross-references", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Cross-references", exact: true })).toBeVisible();
	await expect(page.locator("tbody tr")).toHaveCount(2);
	await expect(page.getByText("Project not found", { exact: true })).toBeVisible();
	await expect(page.getByText("Unused layer", { exact: true })).toBeVisible();
	await expect(page.locator("tbody script")).toHaveCount(0);
	await expect(page.locator("tbody tr").first().locator("td").nth(1).getByRole("link")).toHaveCount(2);
	await page.getByRole("textbox", { name: "Search cross-references" }).fill("dedupe-auto-layer");
	await expect(page.locator("tbody tr")).toHaveCount(1);
	await page.getByRole("textbox", { name: "Search cross-references" }).fill("");
	await expect(page.locator("tbody").getByRole("link", { name: "billing-service", exact: true })).toHaveAttribute("href", "/projects/billing-service");
	await page.getByRole("textbox", { name: "Search cross-references" }).fill("billing");
	await expect(page.locator("tbody tr")).toHaveCount(1);
	await page.getByRole("textbox", { name: "Search cross-references" }).fill("no-match");
	await expect(page.getByRole("heading", { name: "No cross-references found" })).toBeVisible();
	await page.reload();
	await expect(page.locator("tbody tr")).toHaveCount(2);
	await page.screenshot({ path: "test-results/cross-references.png", fullPage: true });
});

test("projects, filters, deep links, raw context and layer usage", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.goto("/projects");
	await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
	await expect(page.getByText("Public access")).toBeVisible();
	await page.screenshot({ path: "test-results/projects.png", fullPage: true });
	await page.getByRole("textbox", { name: "Search projects", exact: true }).fill("name-fallback");
	await expect(page.locator("tbody tr")).toHaveCount(1);
	await page.getByRole("link", { name: "name-fallback", exact: true }).click();
	await expect(page.locator(".prose")).toContainText("Prefer explicit naming.");
	await page.getByRole("button", { name: "Source", exact: true }).click();
	await expect(page.locator("pre.source")).toContainText("# Layer: global/formatting");
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download" }).click();
	expect((await download).suggestedFilename()).toBe("name-fallback-context.md");
	await page.getByRole("link", { name: "Layers", exact: true }).last().click();
	await expect(page.getByText("Automatic", { exact: true })).toBeVisible();
	await page.goto("/layers/project/name-fallback/used-by");
	await expect(page.locator("main").getByRole("link", { name: "name-fallback", exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "name-fallback" })).toBeVisible();
	await page.screenshot({ path: "test-results/layer-usage.png", fullPage: true });
	expect(errors).toEqual([]);
});

test("diagnostics, manifests, registry status and source-only documents", async ({ page }) => {
	await page.goto("/projects/billing-service");
	await expect(page.getByText("Incomplete context", { exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Manifest", exact: true }).click();
	await expect(page.locator("pre.source")).toContainText("name: billing-service");
	await page.goto("/projects/invalid-manifest/manifest");
	await expect(page.locator("pre.source")).toBeVisible();
	await page.goto("/diagnostics");
	await expect(page.getByText("Project manifest is invalid or unreadable.")).toBeVisible();
	await page.goto("/registry");
	await expect(page.getByText("Local directory", { exact: true })).toBeVisible();
	await expect(page.getByText("Available", { exact: true })).toBeVisible();
});

test("theme, command search and mobile navigation", async ({ page }) => {
	await page.goto("/projects");
	await page.locator("#theme").selectOption("dark");
	await expect(page.locator("html")).toHaveClass("dark");
	await page.reload();
	await expect(page.locator("html")).toHaveClass("dark");
	await page.keyboard.press("Control+k");
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.getByRole("textbox", { name: "Search projects and layers" }).fill("formatting");
	await page.getByRole("dialog").getByRole("link", { name: "global/formatting" }).click();
	await expect(page.getByRole("heading", { name: "formatting", exact: true })).toBeVisible();
	await page.screenshot({ path: "test-results/dark-context.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Open navigation" }).click();
	await page.locator("aside").getByRole("link", { name: "Projects", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
	await expect.poll(() => page.locator("aside").evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
	await page.screenshot({ path: "test-results/mobile-projects.png", fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("BabelShark is absent without configuration and registry content is never marked", async ({ page }) => {
	await page.goto("/projects/billing-service");
	await expect(page.locator(".prose")).toBeVisible();
	await expect(page.locator("#babelshark-embed")).toHaveCount(0);
	await expect(page.locator(".bs-activator")).toHaveCount(0);
	await expect(page.locator(".__ .__")).toHaveCount(0);
	await expect(page.locator(".prose")).toHaveClass(/__bs-ignore/);
});

test("configured localization loader is single and variables survive reactive updates", async ({ page }) => {
	let loads = 0;
	await page.route("**/api/session", async route => {
		const response = await route.fetch();
		const json = await response.json();
		await route.fulfill({ json: { ...json, babelshark: { projectId: 123, accessCode: "test-public-code" } } });
	});
	await page.route("https://cdn.babelshark.net/**", async route => {
		loads++;
		await route.fulfill({ contentType: "text/javascript", body: "window.__testConfig = window.babelSharkConfig;" });
	});
	await page.goto("/projects");
	await expect(page.locator(".bs-activator")).toHaveCount(1);
	await expect.poll(() => loads).toBe(1);
	expect(await page.evaluate(() => (window as unknown as{ __testConfig: { projectId: number } }).__testConfig.projectId)).toBe(123);
	await page.getByRole("textbox", { name: "Search projects", exact: true }).fill("name-fallback");
	await expect(page.locator(".panel-foot .__var")).toHaveText("1");
	await page.locator("aside").getByRole("link", { name: "Layers", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
	await expect(page.locator("#babelshark-embed")).toHaveCount(1);
	await expect(page.locator(".__ .__")).toHaveCount(0);
	expect(loads).toBe(1);
});

test("SSO selection and denial messages reveal no registry data", async ({ page }) => {
	await page.route("**/api/session", route => route.fulfill({ json: { mode: "sso", viewer: null, providers: [{ id: "one", name: "OnQuests" }, { id: "two", name: "MySmartBots" }], babelshark: null } }));
	let catalogCalls = 0;
	page.on("request", request => { if(request.url().endsWith("/api/catalog")) catalogCalls++; });
	await page.goto("/login?error=access_denied");
	await expect(page.getByRole("link", { name: "Continue with OnQuests" })).toHaveAttribute("href", "/auth/login/one");
	await expect(page.getByRole("link", { name: "Continue with MySmartBots" })).toBeVisible();
	await expect(page.getByRole("alert")).toContainText("required viewer role");
	expect(catalogCalls).toBe(0);
});

test("Markdown stays inert and broken registry requests show a retry state", async ({ page }) => {
	await page.route("**/api/projects/name-fallback", async route => {
		const response = await route.fetch();
		const json = await response.json();
		await route.fulfill({ json: { ...json, context: '<script>window.registryScriptRan = true</script>\n\n<img src=x onerror="window.registryScriptRan=true">\n\n[Unsafe](javascript:alert(1))' } });
	});
	await page.goto("/projects/name-fallback");
	await expect(page.locator(".prose")).toContainText("<script>");
	await expect(page.locator(".prose script, .prose img, .prose a[href^='javascript:']")).toHaveCount(0);
	expect(await page.evaluate(() => (window as unknown as{ registryScriptRan?: boolean }).registryScriptRan)).toBeUndefined();
	await page.route("**/api/catalog", route => route.fulfill({ status: 503, json: { error: "Registry unavailable." } }));
	await page.getByRole("button", { name: "Refresh registry data" }).click();
	await expect(page.getByRole("alert")).toContainText("Registry unavailable.");
	await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
});

test("expired viewer session clears registry content and returns to provider selection", async ({ page }) => {
	await page.route("**/api/session", route => route.fulfill({ json: { mode: "sso", viewer: { name: "Test Viewer", providerId: "one" }, providers: [{ id: "one", name: "OnQuests" }], babelshark: null } }));
	await page.goto("/projects");
	await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
	await page.route("**/api/catalog", route => route.fulfill({ status: 401, json: { error: "Sign in required." } }));
	await page.getByRole("button", { name: "Refresh registry data" }).click();
	await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Continue with OnQuests" })).toBeVisible();
	await expect(page.locator("table")).toHaveCount(0);
});

test("layer overview explains resolution order and category navigation filters deep links", async ({ page }) => {
	await page.goto("/layers");
	const names = ["Global", "Domain", "Language", "Framework", "Project"];
	await expect(page.locator(".layer-subnav .__")).toHaveText(names);
	await expect(page.locator(".layer-timeline h2")).toHaveText(names);
	await expect(page.locator("main table")).toHaveCount(0);
	await expect(page.getByText("Layers are concatenated as text.", { exact: false })).toBeVisible();
	await expect(page.locator(".__ .__")).toHaveCount(0);
	await page.screenshot({ path: "test-results/layers-timeline.png", fullPage: true });
	await page.locator(".layer-subnav").getByRole("link", { name: "Language" }).click();
	await expect(page).toHaveURL(/\/layers\/language$/);
	await expect(page.getByRole("heading", { name: "Language", exact: true })).toBeVisible();
	await expect(page.locator("tbody tr")).toHaveCount(1);
	await expect(page.locator("tbody")).toContainText("typescript");
	await page.getByRole("textbox", { name: "Search layers and content" }).fill("no-such-layer");
	await expect(page.getByText("No layers match your search.")).toBeVisible();
	await page.locator(".layer-subnav").getByRole("link", { name: "Global" }).click();
	await expect(page.getByRole("textbox", { name: "Search layers and content" })).toHaveValue("");
	await expect(page.locator("tbody tr")).toHaveCount(2);
	await page.getByRole("link", { name: "formatting", exact: true }).click();
	await expect(page.locator(".layer-subnav-link.active")).toContainText("Global");
	await page.getByRole("link", { name: "Back to category" }).click();
	await expect(page).toHaveURL(/\/layers\/global$/);
	await page.reload();
	await expect(page.locator("tbody tr")).toHaveCount(2);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/layers");
	await expect(page.locator(".layer-timeline h2")).toHaveText(names);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
