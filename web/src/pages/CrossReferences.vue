<script setup lang="ts">
import { computed, ref } from "vue";
import { GitBranch, Search } from "lucide-vue-next";
import { catalog } from "@/lib/api";
const query = ref("");
const references = computed(() => (catalog.value?.crossReferences ?? []).filter(item => `${item.sourceProjectIds.join(" ")} ${item.layer} ${item.targetProjectId} ${item.text}`.toLowerCase().includes(query.value.trim().toLowerCase())));
</script>
<template>
  <div class="page-head"><div><p class="__ eyebrow">Knowledge on demand</p><h1 class="__">Cross-references</h1><p class="__ subtext">Explore conditional connections between project contexts.</p></div></div>
  <div class="panel p-6 mb-6 flex items-start gap-4"><GitBranch class="size-5 text-primary shrink-0 mt-1"/><div><h2 class="__ mb-2">Load additional context only when it is needed</h2><p class="__ subtext">Projects can direct an AI agent to another project when its instructions are relevant only in certain situations. This keeps the main context focused and avoids loading unnecessary information.</p><p class="__ subtext mt-3 text-xs">References are detected from Markdown text blocks containing both <code class="__var">resolve_context</code> and <code class="__var">project_id=</code>. Conditions are shown as written; referenced contexts are not loaded automatically.</p></div></div>
  <div class="panel">
    <div class="toolbar"><label class="search-field"><Search class="size-4 subtext"/><span class="__ sr-only">Search cross-references</span><input v-model="query" placeholder="Search cross-references…" aria-label="Search cross-references"></label></div>
    <div class="table-scroll"><table v-if="references.length"><thead><tr><th class="__">Layer</th><th class="__">Source projects</th><th class="__">Target project</th><th class="__">Instruction</th></tr></thead><tbody>
      <tr v-for="item in references" :key="`${item.layer}:${item.line}:${item.targetProjectId}`">
        <td><RouterLink :to="`/layers/${item.layer}`" class="__bs-ignore chip" :data-type="item.layer.split('/')[0]">{{ item.layer }}</RouterLink><p class="__ subtext text-xs mt-1">Line <span class="__var">{{ item.line }}</span></p></td>
        <td><div v-if="item.sourceProjectIds.length" class="chips"><RouterLink v-for="projectId in item.sourceProjectIds" :key="projectId" :to="`/projects/${encodeURIComponent(projectId)}`" class="__bs-ignore chip">{{ projectId }}</RouterLink></div><span v-else class="__ subtext">Unused layer</span></td>
        <td><RouterLink v-if="item.targetExists" :to="`/projects/${encodeURIComponent(item.targetProjectId)}`" class="__bs-ignore text-primary font-medium">{{ item.targetProjectId }}</RouterLink><template v-else><span class="__bs-ignore">{{ item.targetProjectId }}</span><p class="__ warning text-xs mt-1">Project not found</p></template></td>
        <td class="min-w-72 max-w-xl"><p class="__bs-ignore whitespace-pre-wrap break-words">{{ item.text }}</p></td>
      </tr>
    </tbody></table><div v-else class="empty"><GitBranch class="size-8 mx-auto mb-3"/><h2 class="__">No cross-references found</h2><p v-if="query" class="__">Try a different search.</p><p v-else class="__">No matching context calls were found in the readable Markdown layers.</p></div></div>
    <div class="__ panel-foot">Showing <span class="__var">{{ references.length }}</span> cross-references</div>
  </div>
</template>
