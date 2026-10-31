<script setup lang="ts">
import { computed } from 'vue'
import { asset, DEFAULT_EXERCISE_IMAGE } from './store'

const props = defineProps<{ image?: string; alt?: string }>()
const source = computed(() => asset(props.image || DEFAULT_EXERCISE_IMAGE))
function useDefault(event: Event): void {
  (event.target as HTMLImageElement).src = asset(DEFAULT_EXERCISE_IMAGE)
}
</script>

<template><img :src="source" :alt="alt || '动作卡通插图'" @error="useDefault"/></template>
