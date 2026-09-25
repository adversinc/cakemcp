<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Layers, Folder, GitBranch, ShieldCheck, Database, Search, ChevronRight, Menu, RefreshCw, Globe, LogOut, ArrowRight, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, catalog, loadCatalog, session, state, type Session } from "@/lib/api";
import { setupBabelShark } from "@/lib/babelshark";
import { layerCategories } from "@/lib/layers";
const route = useRoute();
const router = useRouter();
const ready = ref(false);
const startupError = ref("");
const mobile = ref(false);
const palette = ref(false);
const quickQuery = ref("");
const refreshVersion = ref(0);
const theme = ref("system");
const dark = ref(false);
const media = window.matchMedia("(prefers-color-scheme: dark)");
const nav = [{ name: "Projects", to: "/projects", icon: Folder }, { name: "Layers", to: "/layers", icon: Layers }, { name: "Cross-references", to: "/cross-references", icon: GitBranch }, { name: "Diagnostics", to: "/diagnostics", icon: ShieldCheck }, { name: "Registry", to: "/registry", icon: Database }];
const layerCategory = computed(() => route.path.startsWith("/layers/") ? layerCategories.find(category => category.id === route.params.type) : undefined);
const signedOut = computed(() => session.value?.mode === "sso" && !session.value.viewer);
const quickResults = computed(() => [
	...(catalog.value?.projects.map(project => ({ label: project.name, group: "Project", to: `/projects/${project.id}` })) ?? []),
	...(catalog.value?.layers.map(layer => ({ label: `${layer.type}/${layer.name}`, group: "Layer", to: `/layers/${layer.type}/${layer.name}` })) ?? []),
].filter(item => item.label.toLowerCase().includes(quickQuery.value.toLowerCase())).slice(0, 30));
const applyTheme = () => { dark.value = theme.value === "dark" || (theme.value === "system" && media.matches); document.documentElement.classList.toggle("dark", dark.value); };
watch(theme, () => { try { localStorage.setItem("cakemcp-theme", theme.value); } catch { /* Theme still works without storage. */ } applyTheme(); });
watch(() => route.fullPath, () => { mobile.value = false; palette.value = false; document.title = `${route.params.id || route.params.name || route.meta.title || 'Registry'} · cakemcp`; });
watch(signedOut, value => { if(value) { palette.value = false; catalog.value = undefined; } });
const keyboard = (event: KeyboardEvent) => { if((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !signedOut.value) { event.preventDefault(); palette.value = !palette.value; } if(event.key === "Escape") mobile.value = false; };
const boot = async () => {
	startupError.value = "";
	try {
		session.value = await api<Session>("/session"); ready.value = true;
		await setupBabelShark(session.value.babelshark);
		if(!signedOut.value) { if(route.path === "/login") await router.replace("/projects"); await loadCatalog(); }
	} catch(e) { startupError.value = (e as Error).message; }
};
const refresh = async () => { await loadCatalog(true); refreshVersion.value++; };
const logout = async () => {
	try {
		const response = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
		if(!response.ok) throw new Error("Sign out failed. Please try again.");
		catalog.value = undefined;
		if(session.value) session.value = { ...session.value, viewer: null };
		await router.push("/login");
	} catch(e) { state.error = (e as Error).message; }
};
onMounted(() => { try { const stored = localStorage.getItem("cakemcp-theme"); if(stored && ["light", "dark", "system"].includes(stored)) theme.value = stored; } catch { /* System theme is the default. */ } applyTheme(); media.addEventListener("change", applyTheme); window.addEventListener("keydown", keyboard); void boot(); });
onUnmounted(() => { media.removeEventListener("change", applyTheme); window.removeEventListener("keydown", keyboard); });
</script>
<template>
  <div v-if="startupError" class="login"><div class="login-card"><h1 class="__">Unable to connect</h1><p class="__ subtext mb-5">{{ startupError }}</p><Button @click="boot"><span class="__">Try again</span></Button></div></div>
  <div v-else-if="!ready" class="__ empty" role="status">Loading cakemcp…</div>
  <div v-else-if="signedOut" class="login">
    <div class="login-card">
      <div class="brand px-0 mb-10"><span class="brand-icon"><Layers class="size-5"/></span><span class="__bs-ignore">cakemcp</span></div>
      <p class="__ eyebrow">Context, in good company</p><h1 class="__">Welcome back</h1><p class="__ subtext mb-8">Sign in with your organization to explore the knowledge registry.</p>
      <p v-if="route.query.error === 'access_denied'" class="__ notice" role="alert">Your account does not have the required viewer role. Contact your administrator.</p>
      <p v-else-if="route.query.error" class="__ notice" role="alert">Sign in could not be completed. Please try again.</p>
      <div class="grid gap-3"><Button v-for="provider in session?.providers" :key="provider.id" as-child variant="outline" class="justify-between h-12"><a :href="`/auth/login/${provider.id}`"><span class="__">Continue with <span class="__var">{{ provider.name }}</span></span><ArrowRight class="size-4"/></a></Button></div>
      <p class="__ subtext text-xs mt-8">Access is managed by your organization.</p>
      <span v-if="session?.babelshark" class="bs-activator inline-block mt-5" data-drop="auto" :data-theme="dark ? 'dark' : 'light'"/>
    </div>
  </div>
  <div v-else class="shell">
    <aside class="sidebar" :class="{ open: mobile }" aria-label="Main navigation">
      <div class="flex items-center justify-between"><RouterLink to="/projects" class="brand"><span class="brand-icon"><Layers class="size-5"/></span><span class="__bs-ignore">cakemcp</span></RouterLink><Button variant="ghost" size="icon" class="menu-toggle" aria-label="Close navigation" @click="mobile = false"><X class="size-4"/></Button></div>
      <p class="__ eyebrow nav-label">Workspace</p>
      <nav>
        <template v-for="item in nav" :key="item.to">
          <RouterLink :to="item.to" class="nav-link" :class="{ active: item.to === '/layers' ? route.path === '/layers' : route.path.startsWith(item.to) }"><component :is="item.icon" class="size-4"/><span class="__">{{ item.name }}</span><span v-if="item.to === '/diagnostics' && catalog?.diagnostics.some(issue => issue.severity === 'error')" class="size-1.5 bg-amber-500 rounded-full ml-auto"/></RouterLink>
          <ul v-if="item.to === '/layers'" class="layer-subnav" aria-label="Layer categories">
            <li v-for="(category, index) in layerCategories" :key="category.id"><RouterLink :to="`/layers/${category.id}`" class="layer-subnav-link" :class="{ active: layerCategory?.id === category.id }"><span class="layer-subnav-number" aria-hidden="true">{{ index + 1 }}</span><span class="__">{{ category.name }}</span></RouterLink></li>
          </ul>
        </template>
      </nav>
      <div class="sidebar-footer">
        <div class="footer-card"><Layers class="size-4 text-primary shrink-0"/><div><p class="__ text-xs font-medium">Built in layers</p><p class="__ subtext text-[11px] mt-1">Shared knowledge. Clear context.</p></div></div>
        <div class="flex items-center justify-between gap-2 px-2"><label class="__ subtext text-xs" for="theme">Theme</label><select id="theme" v-model="theme" class="filter"><option value="system" class="__">System</option><option value="light" class="__">Light</option><option value="dark" class="__">Dark</option></select></div>
        <div v-if="session?.babelshark" class="px-2"><span class="bs-activator" data-drop="right-top" :data-theme="dark ? 'dark' : 'light'"/></div>
        <div class="flex items-center gap-2 border-t pt-4 px-2"><Globe v-if="session?.mode === 'public'" class="size-4 subtext"/><ShieldCheck v-else class="size-4 good"/><span v-if="session?.mode === 'public'" class="__ subtext text-xs">Public access</span><span v-else class="__bs-ignore text-xs truncate">{{ session?.viewer?.name }}</span><Button v-if="session?.viewer" variant="ghost" size="icon" class="ml-auto" aria-label="Sign out" @click="logout"><LogOut class="size-4"/></Button></div>
      </div>
    </aside>
    <div class="main" @click="mobile && (mobile = false)">
      <header class="topbar"><div class="flex items-center gap-3 min-w-0"><Button class="menu-toggle" variant="ghost" size="icon" aria-label="Open navigation" @click.stop="mobile = !mobile"><Menu class="size-4"/></Button><div class="breadcrumbs"><span class="__ desktop-label">Workspace</span><ChevronRight class="size-3 desktop-label shrink-0"/><RouterLink :to="`/${String(route.meta.title || 'Projects').toLowerCase()}`" class="__">{{ route.meta.title || 'Registry' }}</RouterLink><template v-if="layerCategory"><ChevronRight class="size-3 shrink-0"/><RouterLink :to="`/layers/${layerCategory.id}`" class="__">{{ layerCategory.name }}</RouterLink></template><template v-if="route.params.id || route.params.name"><ChevronRight class="size-3 shrink-0"/><span class="__bs-ignore">{{ route.params.id || route.params.name }}</span></template></div></div><div class="flex items-center gap-2"><Button variant="outline" size="sm" @click="palette = true"><Search class="size-3.5"/><span class="__ desktop-label">Quick search</span><kbd class="desktop-label subtext text-[10px] ml-6">⌘ K</kbd></Button><Button variant="ghost" size="icon" :disabled="state.loading" aria-label="Refresh registry data" @click="refresh"><RefreshCw class="size-3.5 subtext" :class="{ 'animate-spin': state.loading }"/></Button></div></header>
      <main class="content"><div v-if="state.error" class="notice" role="alert"><span class="__">{{ state.error }}</span><Button size="sm" variant="outline" @click="refresh"><span class="__">Retry</span></Button></div><div v-if="state.loading && !catalog && route.path !== '/registry' && route.path !== '/layers'" role="status" class="space-y-5"><span class="__ sr-only">Loading registry…</span><Skeleton class="h-9 w-52"/><Skeleton class="h-24 w-full"/><Skeleton class="h-80 w-full"/></div><RouterView v-else-if="catalog || route.path === '/registry' || route.path === '/layers'" :key="refreshVersion"/></main>
    </div>
    <Dialog v-model:open="palette"><DialogContent class="sm:max-w-xl"><DialogHeader><DialogTitle><span class="__">Go to anything</span></DialogTitle><DialogDescription><span class="__">Find a project or knowledge layer.</span></DialogDescription></DialogHeader><label><span class="__ sr-only">Search projects and layers</span><Input v-model="quickQuery" placeholder="Search projects and layers…" aria-label="Search projects and layers"/></label><div class="max-h-80 overflow-auto"><RouterLink v-for="item in quickResults" :key="item.to" :to="item.to" class="palette-link flex justify-between gap-3" @click="palette = false"><span class="__bs-ignore">{{ item.label }}</span><span class="__ subtext text-xs">{{ item.group }}</span></RouterLink><p v-if="!quickResults.length" class="__ empty">No results found.</p></div></DialogContent></Dialog>
  </div>
</template>
