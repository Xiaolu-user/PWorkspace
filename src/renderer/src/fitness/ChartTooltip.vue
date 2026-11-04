<script setup lang="ts">
defineProps<{ x: number; y: number; label: string; lines: string[] }>()
</script>

<template><Teleport to="body"><div class="fitness-chart-tooltip" role="tooltip" :style="{left:`clamp(12px, ${x+14}px, calc(100vw - 232px))`,top:`clamp(12px, ${y+14}px, calc(100vh - 110px))`}"><strong>{{ label }}</strong><span v-for="(line,i) in lines" :key="i">{{ line }}</span></div></Teleport></template>

<style scoped>
.fitness-chart-tooltip{position:fixed;z-index:3000;pointer-events:none;min-width:130px;max-width:220px;padding:11px 15px;border:1px solid var(--line);border-radius:11px;background:var(--surface);color:var(--ink);box-shadow:0 7px 24px #243b531c;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.fitness-chart-tooltip strong{display:block;font-weight:600;margin-bottom:3px}.fitness-chart-tooltip span{display:block;font-variant-numeric:tabular-nums;color:var(--secondary)}
</style>
