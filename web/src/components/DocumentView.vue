<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";
import { Copy, Download, Check } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
const props = withDefaults(defineProps<{ content: string; filename?: string; sourceOnly?: boolean }>(), { filename: "context.md", sourceOnly: false });
const source = ref(false);
const copied = ref(false);
const copyFailed = ref(false);
const parser = new MarkdownIt({ html: false, linkify: false });
// Remote images can leak document URLs; the viewer displays their alt text instead.
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);
const html = computed(() => parser.render(props.content));
const copy = async () => {
	try { await navigator.clipboard.writeText(props.content); copied.value = true; copyFailed.value = false; setTimeout(() => { copied.value = false; }, 1800); }
	catch { copyFailed.value = true; }
};
const download = () => {
	const url = URL.createObjectURL(new Blob([props.content], { type: "text/plain;charset=utf-8" }));
	const link = document.createElement("a"); link.href = url; link.download = props.filename; link.click(); URL.revokeObjectURL(url);
};
</script>
<template>
  <div class="panel">
    <div class="toolbar">
      <div v-if="!sourceOnly" class="flex gap-1">
        <Button size="sm" :variant="!source ? 'secondary' : 'ghost'" @click="source = false"><span class="__">Preview</span></Button>
        <Button size="sm" :variant="source ? 'secondary' : 'ghost'" @click="source = true"><span class="__">Source</span></Button>
      </div>
      <span class="__ subtext text-xs ml-auto"><span class="__var">{{ content.length.toLocaleString() }}</span> characters</span>
      <Button variant="outline" size="sm" @click="copy"><Check v-if="copied" class="size-3.5"/><Copy v-else class="size-3.5"/><span v-if="copied" class="__">Copied</span><span v-else class="__">Copy</span></Button>
      <Button variant="outline" size="sm" @click="download"><Download class="size-3.5"/><span class="__">Download</span></Button>
    </div>
    <p v-if="copyFailed" class="__ notice" role="alert">Clipboard access is unavailable. Use Download or copy from Source.</p>
    <pre v-if="source || sourceOnly" class="__bs-ignore source">{{ content }}</pre>
    <!-- Registry documents must remain exactly in their source language. -->
    <div v-else class="__bs-ignore prose" v-html="html" />
  </div>
</template>
