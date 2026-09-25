<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, AlertTriangle, FileText } from "lucide-vue-next";
import { api, catalog, type ProjectDetail } from "@/lib/api";
import DocumentView from "@/components/DocumentView.vue";
import IssueList from "@/components/IssueList.vue";
const route = useRoute();
const detail = ref<ProjectDetail>();
const loading = ref(false);
const error = ref("");
const selected = ref("");
const tab = computed(() => String(route.params.tab || "context"));
const tabs = [{ id: "context", name: "Context" }, { id: "layers", name: "Layers" }, { id: "manifest", name: "Manifest" }, { id: "diagnostics", name: "Diagnostics" }];
const content = computed(() => catalog.value?.layers.find(layer => `${layer.type}/${layer.name}` === selected.value)?.content ?? "");
const issues = computed(() => catalog.value?.diagnostics.filter(item => item.projectId === route.params.id) ?? []);
watch(() => route.params.id, async (id, _, cleanup) => {
	let active = true; cleanup(() => { active = false; });
	loading.value = true; error.value = ""; detail.value = undefined;
	try {
		const result = await api<ProjectDetail>(`/projects/${encodeURIComponent(String(id))}`);
		if(!active) return;
		detail.value = result;
		selected.value = result.layers[0] ? `${result.layers[0].type}/${result.layers[0].name}` : "";
	} catch(e) { if(active) error.value = (e as Error).message; }
	finally { if(active) loading.value = false; }
}, { immediate: true });
</script>
<template>
  <RouterLink to="/projects" class="flex items-center gap-2 subtext text-xs mb-5"><ArrowLeft class="size-3.5"/><span class="__">All projects</span></RouterLink>
  <div v-if="loading" class="__ empty" role="status">Loading project…</div>
  <div v-else-if="error" class="__ notice" role="alert">{{ error }}</div>
  <template v-else-if="detail">
    <div class="page-head"><div><p class="__ eyebrow">Project context</p><h1 class="__bs-ignore">{{ detail.name }}</h1><p class="__ subtext"><span class="__var">{{ detail.layers.length }}</span> layers, assembled in resolution order.</p></div><span class="__ chip">Read-only</span></div>
    <div v-if="detail.warnings.length" class="notice"><AlertTriangle class="size-4 warning shrink-0 mt-0.5"/><div><p class="__ font-medium">Incomplete context</p><p class="__ subtext">Some instructions could not be loaded. Review Diagnostics before using this context.</p></div></div>
    <nav class="tabs" aria-label="Project sections"><RouterLink v-for="item in tabs" :key="item.id" :to="`/projects/${encodeURIComponent(detail.id)}/${item.id}`" class="tab" :class="{ active: tab === item.id }"><span class="__">{{ item.name }}</span><span v-if="item.id === 'diagnostics' && issues.length" class="chip ml-2">{{ issues.length }}</span></RouterLink></nav>
    <DocumentView v-if="tab === 'context'" :content="detail.context" :filename="`${detail.id}-context.md`"/>
    <DocumentView v-else-if="tab === 'manifest'" :content="detail.rawManifest" :filename="`${detail.id}.yaml`" source-only/>
    <IssueList v-else-if="tab === 'diagnostics'" :items="issues"/>
    <div v-else-if="tab === 'layers' && detail.layers.length" class="panel split">
      <div class="layer-list"><button v-for="(layer, index) in detail.layers" :key="`${layer.type}/${layer.name}`" class="layer-item" :class="{ selected: selected === `${layer.type}/${layer.name}` }" @click="selected = `${layer.type}/${layer.name}`"><div class="flex items-center gap-2 mb-2"><span class="subtext text-xs">{{ String(index + 1).padStart(2, '0') }}</span><span class="__ chip" :data-type="layer.type">{{ layer.type }}</span><span v-if="layer.automatic" class="__ chip text-primary">Automatic</span></div><span class="__bs-ignore font-medium text-xs break-all">{{ layer.name }}</span></button></div>
      <div class="min-w-0"><div class="toolbar"><FileText class="size-4 subtext"/><RouterLink :to="`/layers/${selected}`" class="__bs-ignore text-xs underline">{{ selected }}</RouterLink></div><DocumentView :content="content" :filename="`${selected.split('/')[1]}.md`"/></div>
    </div>
    <div v-else class="__ empty">No content available for this section.</div>
  </template>
</template>
