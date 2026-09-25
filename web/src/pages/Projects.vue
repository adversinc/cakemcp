<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, Folder, ArrowUpRight, CheckCircle2, AlertCircle, Layers as LayersIcon, Boxes } from "lucide-vue-next";
import { catalog } from "@/lib/api";
const query = ref("");
const filter = ref("");
const options = computed(() => [...new Set(catalog.value?.projects.flatMap((project) => project.layers) ?? [])].sort());
const projects = computed(() => catalog.value?.projects.filter((project) => `${project.id} ${project.name}`.toLowerCase().includes(query.value.toLowerCase()) && (!filter.value || project.layers.includes(filter.value))) ?? []);
</script>
<template>
  <div class="page-head"><div><p class="__ eyebrow">Your knowledge, connected</p><h1 class="__">Projects</h1><p class="__ subtext">Explore the instructions that guide your coding agents.</p></div><span class="chip"><span class="size-1.5 rounded-full bg-primary"/><span class="__">Read-only registry</span></span></div>
  <div class="stats">
    <div class="stat"><div class="flex items-center justify-between subtext"><span class="__">Projects</span><Folder class="size-4"/></div><div class="stat-number">{{ catalog?.projects.length ?? 0 }}</div></div>
    <div class="stat"><div class="flex items-center justify-between subtext"><span class="__">Knowledge layers</span><LayersIcon class="size-4"/></div><div class="stat-number">{{ catalog?.layers.length ?? 0 }}</div></div>
    <div class="stat"><div class="flex items-center justify-between subtext"><span class="__">Shared layers</span><Boxes class="size-4"/></div><div class="stat-number">{{ catalog?.layers.filter(layer => layer.usedBy.length > 1).length ?? 0 }}</div></div>
  </div>
  <div class="panel">
    <div class="toolbar"><label class="search-field"><Search class="size-4 subtext"/><span class="__ sr-only">Search projects</span><input v-model="query" placeholder="Search projects…" aria-label="Search projects"></label><label class="flex items-center gap-2 text-xs subtext"><span class="__">Layer</span><select v-model="filter" class="filter" aria-label="Filter by layer"><option value="" class="__">All layers</option><option v-for="option in options" :key="option" :value="option" class="__bs-ignore">{{ option }}</option></select></label></div>
    <div class="table-scroll"><table v-if="projects.length"><thead><tr><th class="__">Project</th><th class="__">Knowledge stack</th><th class="__">Layers</th><th class="__">Status</th><th><span class="__ sr-only">Open</span></th></tr></thead><tbody>
      <tr v-for="project in projects" :key="project.id">
        <td><RouterLink :to="`/projects/${encodeURIComponent(project.id)}`" class="project-name"><Folder class="project-icon size-9 shrink-0"/><div class="__bs-ignore">{{ project.name }}<div v-if="project.name !== project.id" class="subtext font-normal text-xs">{{ project.id }}</div></div></RouterLink></td>
        <td><div class="chips"><span v-for="layer in project.layers.filter(layer => !layer.startsWith('project/')).slice(0, 4)" :key="layer" class="__bs-ignore chip" :data-type="layer.split('/')[0]">{{ layer.split('/')[1] }}</span><span v-if="!project.layers.length" class="__ subtext">No layers</span></div></td>
        <td class="subtext">{{ project.layers.length }}</td>
        <td><RouterLink :to="`/projects/${encodeURIComponent(project.id)}/diagnostics`" class="flex items-center gap-1.5 text-xs" :class="project.issues ? 'warning' : 'good'"><AlertCircle v-if="project.issues" class="size-3.5"/><CheckCircle2 v-else class="size-3.5"/><span v-if="project.issues" class="__"><span class="__var">{{ project.issues }}</span> issues</span><span v-else class="__">Ready</span></RouterLink></td>
        <td><RouterLink :to="`/projects/${encodeURIComponent(project.id)}`" aria-label="Open project"><ArrowUpRight class="size-4 subtext"/></RouterLink></td>
      </tr>
    </tbody></table><div v-else class="empty"><Folder class="size-8 mx-auto mb-3"/><h2 class="__">No projects found</h2><p class="__">Try a different search or check the registry source.</p></div></div>
    <div class="__ panel-foot">Showing <span class="__var">{{ projects.length }}</span> projects</div>
  </div>
  <p class="__ subtext text-xs mt-5">One source of truth. Shared rules, project-specific context.</p>
</template>
