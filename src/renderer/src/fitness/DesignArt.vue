<script setup lang="ts">
import { computed, useId } from 'vue'
import { asset } from './store'
const props=defineProps<{kind:string}>()
// Reuse our own design sheet artwork through an SVG viewport. No UI is painted into the page.
const regions:Record<string,string>={hero:'1105 166 455 170',mint:'185 458 72 51',lavender:'429 465 72 45',violet:'680 451 48 54',peach:'915 452 58 53',pink:'1118 583 43 49','note-character':'1437 665 130 210'}
const clipId=useId()
const rect=computed(()=>box.value.split(' ').map(Number))
const box=computed(()=>regions[props.kind]||regions.mint)
</script>
<template><svg class="fit-design-art" :viewBox="box" aria-hidden="true"><defs><clipPath :id="clipId"><rect :x="rect[0]" :y="rect[1]" :width="rect[2]" :height="rect[3]"/></clipPath></defs><image :clip-path="'url(#'+clipId+')'" :href="asset(kind==='note-character'?'fitness/design-entry.png':'fitness/design-artwork.png')" width="1586" height="992"/></svg></template>
