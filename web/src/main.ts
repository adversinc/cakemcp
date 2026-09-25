import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Projects from "./pages/Projects.vue";
import Project from "./pages/Project.vue";
import Layers from "./pages/Layers.vue";
import CrossReferences from "./pages/CrossReferences.vue";
import Diagnostics from "./pages/Diagnostics.vue";
import Registry from "./pages/Registry.vue";
import "./style.css";

const router = createRouter({ history: createWebHistory(), routes: [
	{ path: "/", redirect: "/projects" },
	{ path: "/projects", component: Projects, meta: { title: "Projects" } },
	{ path: "/projects/:id/:tab?", component: Project, meta: { title: "Projects" } },
	{ path: "/layers/:type?/:name?/:tab?", component: Layers, meta: { title: "Layers" } },
	{ path: "/cross-references", component: CrossReferences, meta: { title: "Cross-references" } },
	{ path: "/diagnostics", component: Diagnostics, meta: { title: "Diagnostics" } },
	{ path: "/registry", component: Registry, meta: { title: "Registry" } },
	{ path: "/login", component: Projects, meta: { title: "Sign in" } },
	{ path: "/:pathMatch(.*)*", component: { template: '<div class="empty"><h1 class="__">Page not found</h1><a class="__" href="/projects">Back to projects</a></div>' } },
] });
createApp(App).use(router).mount("#app");
