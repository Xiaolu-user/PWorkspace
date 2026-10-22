<script setup lang="ts">
import { computed } from 'vue'
import { Grid, List, Document, Link, Search, Setting, Plus, ArrowRight, ArrowLeft, Check, Close, EditPen, Delete, Calendar, Clock, FolderOpened, Download, Upload, CircleCheck, MoreFilled, Collection, Sunny, Monitor, Lock, Warning, Refresh, CirclePlus, Notebook, Trophy } from '@element-plus/icons-vue'
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const icons: Record<string, unknown> = { fitness: Trophy, grid: Grid, list: List, document: Document, link: Link, search: Search, setting: Setting, plus: Plus, right: ArrowRight, left: ArrowLeft, check: Check, close: Close, edit: EditPen, delete: Delete, calendar: Calendar, clock: Clock, folder: FolderOpened, download: Download, upload: Upload, done: CircleCheck, more: MoreFilled, collection: Collection, sun: Sunny, monitor: Monitor, lock: Lock, warning: Warning, refresh: Refresh, add: CirclePlus, notebook: Notebook, Trophy }
const icon = computed(() => icons[props.name] || Grid)
</script>
<template><el-icon :size="size" aria-hidden="true"><svg v-if="name === 'fitness'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="4" height="14" rx="1.5"/><rect x="16" y="5" width="4" height="14" rx="1.5"/><path d="M8 12h8M2 9v6M22 9v6"/></svg><component v-else :is="icon" /></el-icon></template>
