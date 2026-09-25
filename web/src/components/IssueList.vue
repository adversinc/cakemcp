<script setup lang="ts">
import { AlertTriangle, Info, CheckCircle2 } from "lucide-vue-next";
import type { Diagnostic } from "@/lib/api";
defineProps<{ items: Diagnostic[] }>();
</script>
<template>
  <div class="panel">
    <div v-if="!items.length" class="empty"><CheckCircle2 class="size-8 mx-auto mb-3 good"/><h2 class="__">All clear</h2><p class="__">No issues were found in this view.</p></div>
    <div v-for="(item, index) in items" :key="index" class="diagnostic">
      <Info v-if="item.severity === 'info'" class="size-4 mt-1 subtext shrink-0"/><AlertTriangle v-else class="size-4 mt-1 shrink-0" :class="item.severity === 'error' ? 'danger' : 'warning'"/>
      <div>
        <p class="__ font-medium">{{ item.message }}</p>
        <div class="flex gap-3 mt-2 subtext text-xs">
          <RouterLink v-if="item.projectId" :to="`/projects/${encodeURIComponent(item.projectId)}/diagnostics`" class="__bs-ignore underline">{{ item.projectId }}</RouterLink>
          <RouterLink v-if="item.layer" :to="`/layers/${item.layer.split('/').map(encodeURIComponent).join('/')}`" class="__bs-ignore underline">{{ item.layer }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
