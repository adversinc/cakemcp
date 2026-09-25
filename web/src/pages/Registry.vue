<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Database, RefreshCw } from "lucide-vue-next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
const status = ref<{ available: boolean; type: string; stale: boolean; revision?: string; lastSuccessfulUpdate?: string; error?: string }>();
const error = ref("");
const loading = ref(false);
const refresh = async () => { loading.value = true; error.value = ""; try { status.value = await api("/registry"); } catch(e) { error.value = (e as Error).message; } finally { loading.value = false; } };
onMounted(refresh);
</script>
<template>
  <div class="page-head"><div><p class="__ eyebrow">Source of truth</p><h1 class="__">Registry</h1><p class="__ subtext">Connection and synchronization details for your knowledge source.</p></div><Button variant="outline" :disabled="loading" @click="refresh"><RefreshCw class="size-4" :class="{ 'animate-spin': loading }"/><span class="__">Refresh status</span></Button></div>
  <div v-if="error" class="__ notice" role="alert">{{ error }}</div>
  <div v-if="status" class="panel"><div class="toolbar"><Database class="size-4 text-primary"/><h2 class="__">Registry connection</h2></div><dl class="definition"><dt class="__">Source type</dt><dd class="__">{{ status.type === 'git' ? 'Git repository' : 'Local directory' }}</dd><dt class="__">Availability</dt><dd class="__" :class="status.available ? 'good' : 'danger'">{{ status.available ? 'Available' : 'Unavailable' }}</dd><dt class="__">Cache state</dt><dd class="__" :class="status.stale ? 'warning' : ''">{{ status.type === 'local' ? 'Local file cache' : status.stale ? 'Serving stale checkout' : 'No synchronization failure recorded' }}</dd><dt class="__">Revision</dt><dd class="__bs-ignore font-mono text-xs">{{ status.revision || '—' }}</dd><dt class="__">Last successful update</dt><dd class="__bs-ignore">{{ status.lastSuccessfulUpdate ? new Date(status.lastSuccessfulUpdate).toLocaleString() : '—' }}</dd></dl><p v-if="status.error" class="__ notice m-5">{{ status.error }}</p><p class="__ panel-foot">Refresh checks the source using the configured cache lifetime; it does not force a Git fetch.</p></div>
</template>
