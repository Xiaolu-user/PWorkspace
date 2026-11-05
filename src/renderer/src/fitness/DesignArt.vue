<script setup lang="ts">
import { computed } from 'vue'
import { asset } from './store'
const props = defineProps<{ kind: string }>()
const kinds = ['hero', 'mint', 'lavender', 'violet', 'peach', 'pink', 'note-character']
const source = computed(() => asset(`fitness/decor/${kinds.includes(props.kind) ? props.kind : 'mint'}.webp`))
</script>

<template><img class="fit-design-art" :src="source" alt="" aria-hidden="true"/></template>
