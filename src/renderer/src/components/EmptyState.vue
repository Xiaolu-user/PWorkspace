<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{ icon?: string; title: string; description?: string; action?: string; compact?: boolean }>(), { icon: 'collection', description: '', action: '', compact: false })
defineEmits<{ action: [] }>()
</script>
<template><div class="empty-state" :class="{ compact }"><span class="empty-icon"><AppIcon :name="icon" :size="26" /></span><strong>{{ title }}</strong><p v-if="description">{{ description }}</p><el-button v-if="action" type="primary" plain @click="$emit('action')"><AppIcon name="plus" :size="16" />{{ action }}</el-button></div></template>
