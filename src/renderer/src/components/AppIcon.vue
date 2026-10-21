<script setup lang="ts">
import { computed } from 'vue'
import { Grid, List, Document, Link, Search, Setting, Plus, ArrowRight, ArrowLeft, Check, Close, EditPen, Delete, Calendar, Clock, FolderOpened, Download, Upload, CircleCheck, MoreFilled, Collection, Sunny, Monitor, Lock, Warning, Refresh, CirclePlus, Notebook } from '@element-plus/icons-vue'
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const icons: Record<string, unknown> = { grid: Grid, list: List, document: Document, link: Link, search: Search, setting: Setting, plus: Plus, right: ArrowRight, left: ArrowLeft, check: Check, close: Close, edit: EditPen, delete: Delete, calendar: Calendar, clock: Clock, folder: FolderOpened, download: Download, upload: Upload, done: CircleCheck, more: MoreFilled, collection: Collection, sun: Sunny, monitor: Monitor, lock: Lock, warning: Warning, refresh: Refresh, add: CirclePlus, notebook: Notebook }
const icon = computed(() => icons[props.name] || Grid)
</script>
<template><el-icon :size="size" aria-hidden="true"><component :is="icon" /></el-icon></template>
