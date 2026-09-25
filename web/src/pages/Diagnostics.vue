<script setup lang="ts">
import { computed, ref } from "vue";
import { catalog } from "@/lib/api";
import IssueList from "@/components/IssueList.vue";
const severity = ref("");
const items = computed(() => catalog.value?.diagnostics.filter(item => !severity.value || item.severity === severity.value) ?? []);
</script>
<template>
  <div class="page-head"><div><p class="__ eyebrow">Registry health</p><h1 class="__">Diagnostics</h1><p class="__ subtext">Find missing instructions and keep your knowledge base consistent.</p></div><label class="flex gap-2 items-center"><span class="__ sr-only">Severity</span><select v-model="severity" class="filter" aria-label="Severity"><option value="" class="__">All findings</option><option value="error" class="__">Errors</option><option value="warning" class="__">Warnings</option><option value="info" class="__">Information</option></select></label></div>
  <IssueList :items="items"/>
</template>
