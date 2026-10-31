<script setup lang="ts">
import type { PlannerData } from '../../../shared/planner'
import CoursePlanner from './CoursePlanner.vue'
defineProps<{ modelValue: 'courses' | 'fitness' | null; data: PlannerData }>()
const emit = defineEmits<{ 'update:modelValue': [value: null]; saved: [] }>()
</script>
<template><CoursePlanner :model-value="modelValue === 'courses'" :semester="data.semester" @update:model-value="emit('update:modelValue', null)" @saved="emit('saved')" /></template>
