<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Search, ArrowLeft, ArrowUpRight, Layers } from "lucide-vue-next";
import { catalog } from "@/lib/api";
import { layerCategories } from "@/lib/layers";
import DocumentView from "@/components/DocumentView.vue";
const route = useRoute();
const query = ref("");
const category = computed(() => layerCategories.find(item => item.id === route.params.type));
watch(() => route.params.type, () => { query.value = ""; });
const selected = computed(() => catalog.value?.layers.find(layer => layer.type === route.params.type && layer.name === route.params.name));
const layers = computed(() => catalog.value?.layers.filter(layer => (layer.type === category.value?.id) && `${layer.name} ${layer.content}`.toLowerCase().includes(query.value.toLowerCase())) ?? []);
</script>
<template>
  <template v-if="route.params.name">
    <RouterLink :to="category ? `/layers/${category.id}` : '/layers'" class="flex gap-2 items-center subtext text-xs mb-5"><ArrowLeft class="size-3.5"/><span class="__">Back to category</span></RouterLink>
    <template v-if="selected">
      <div class="page-head"><div><p class="__ eyebrow">Knowledge layer</p><h1 class="__bs-ignore">{{ selected.name }}</h1><span class="__ chip" :data-type="selected.type">{{ selected.type }}</span></div><span class="__ subtext text-xs">Revision: <span class="__var font-mono">{{ selected.revision.slice(0, 12) }}</span></span></div>
      <nav class="tabs" aria-label="Layer sections"><RouterLink :to="`/layers/${selected.type}/${selected.name}`" class="tab" :class="{ active: route.params.tab !== 'used-by' }"><span class="__">Content</span></RouterLink><RouterLink :to="`/layers/${selected.type}/${selected.name}/used-by`" class="tab" :class="{ active: route.params.tab === 'used-by' }"><span class="__">Used by</span><span class="chip ml-2">{{ selected.usedBy.length }}</span></RouterLink></nav>
      <div v-if="route.params.tab === 'used-by'" class="panel"><RouterLink v-for="id in selected.usedBy" :key="id" :to="`/projects/${id}/layers`" class="diagnostic items-center justify-between"><span class="__bs-ignore font-medium">{{ id }}</span><ArrowUpRight class="size-4"/></RouterLink><div v-if="!selected.usedBy.length" class="__ empty">No project references were found.</div></div>
      <DocumentView v-else :content="selected.content" :filename="`${selected.name}.md`"/>
    </template><div v-else class="__ empty">Layer not found.</div>
  </template>
  <template v-else-if="!route.params.type">
    <div class="page-head"><div><p class="__ eyebrow">From shared rules to project context</p><h1 class="__">Layers</h1><p class="__ subtext">Five categories, assembled in a predictable order.</p></div><span class="__ chip">Resolution order</span></div>
    <div class="layer-guide panel">
      <div class="layer-guide-intro"><h2 class="__">How context comes together</h2><p class="__ subtext">Each project manifest selects the layers it needs. The resolver reads those layers in the order below and combines their Markdown into a single context.</p></div>
      <ol class="layer-timeline" aria-label="Layer resolution order">
        <li v-for="(item, index) in layerCategories" :key="item.id" class="layer-timeline-step">
          <span class="layer-timeline-marker" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="layer-timeline-body"><RouterLink :to="`/layers/${item.id}`" class="layer-timeline-title"><h2 class="__">{{ item.name }}</h2><ArrowUpRight class="size-4"/></RouterLink><p class="__ subtext">{{ item.description }}</p><code class="__bs-ignore layer-timeline-path">{{ item.path }}</code></div>
        </li>
      </ol>
      <div class="layer-guide-notes"><h2 class="__">A few details that matter</h2><ul>
        <li class="__">Within each category, layers follow their order in the project manifest. The same layer is included only once.</li>
        <li class="__">Finally, the resolver tries to append the project layer matching the manifest name, or the project ID when no name is set. If already included, it is not added again.</li>
        <li class="__">Layers are concatenated as text. Later instructions do not automatically override earlier ones or resolve conflicting rules.</li>
      </ul></div>
    </div>
  </template>
  <template v-else-if="category">
    <div class="page-head"><div><p class="__ eyebrow">The building blocks</p><h1 class="__">{{ category.name }}</h1><p class="__ subtext">{{ category.description }}</p></div></div>
    <div class="panel"><div class="toolbar"><label class="search-field"><Search class="size-4 subtext"/><span class="__ sr-only">Search layers and content</span><input v-model="query" placeholder="Search layers and content…" aria-label="Search layers and content"></label></div>
      <div class="table-scroll"><table v-if="layers.length"><thead><tr><th class="__">Layer</th><th class="__">Type</th><th class="__">Used by</th><th class="__">Size</th></tr></thead><tbody><tr v-for="layer in layers" :key="`${layer.type}/${layer.name}`"><td><RouterLink :to="`/layers/${layer.type}/${layer.name}`" class="project-name"><Layers class="size-4 subtext"/><span class="__bs-ignore">{{ layer.name }}</span></RouterLink></td><td><span class="__ chip" :data-type="layer.type">{{ layer.type }}</span></td><td><RouterLink :to="`/layers/${layer.type}/${layer.name}/used-by`" class="__ subtext"><span class="__var">{{ layer.usedBy.length }}</span> projects</RouterLink></td><td class="__ subtext"><span class="__var">{{ layer.content.length.toLocaleString() }}</span> characters</td></tr></tbody></table><div v-else class="__ empty">No layers match your search.</div></div>
      <div class="__ panel-foot">Showing <span class="__var">{{ layers.length }}</span> layers</div>
    </div>
  </template>
  <div v-else class="__ empty">Layer category not found.</div>
</template>
