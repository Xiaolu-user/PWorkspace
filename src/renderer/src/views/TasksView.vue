<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Task } from '../../../shared/types'
import { isOverdue, localDate } from '../../../shared/date'
import { compareReminderTasks } from '../../../shared/reminders'
import { useWorkspace } from '../stores/workspace'
import { confirmDelete } from '../lib/api'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import TaskRow from '../components/TaskRow.vue'
import TaskDialog from '../components/TaskDialog.vue'
const workspace = useWorkspace(); const route = useRoute()
const filter = ref('all'); const query = ref(''); const priority = ref('all')
const page = ref(1); const pageSize = 20; const dialog = ref(false); const selected = ref<Task | null>(null)
const today = computed(() => { void workspace.revision; return localDate() })
const tabs = computed(() => [
  { key: 'all', label: '全部任务', count: workspace.tasks.length },
  { key: 'todo', label: '未完成', count: workspace.dashboard.totalTodo },
  { key: 'done', label: '已完成', count: workspace.dashboard.totalDone },
  { key: 'overdue', label: '已逾期', count: workspace.dashboard.overdue.length }
])
const filtered = computed(() => workspace.tasks.filter(task => {
  const status = filter.value === 'all' || (filter.value === 'overdue' ? isOverdue(task, today.value) : task.status === filter.value)
  return status && (priority.value === 'all' || task.priority === priority.value) && (task.title + '\n' + task.description).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
}).sort((a, b) => compareReminderTasks(a, b, workspace.now)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([filter, query, priority], () => { page.value = 1 })
watch(() => filtered.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / pageSize))) })
function edit(task: Task): void { selected.value = task; dialog.value = true }
function add(): void { selected.value = null; dialog.value = true }
async function remove(task: Task): Promise<void> {
  if (await confirmDelete(task.title)) await workspace.mutate(() => window.workbench.tasks.remove(task.id), '任务已删除')
}
let openedQuery: string | null = null
watch(() => route.query.status, value => { filter.value = value === 'done' ? 'done' : 'all' }, { immediate: true })
watch([() => route.query.id, () => workspace.revision], () => {
  const key = typeof route.query.id === 'string' ? route.query.id : null
  if (!key) { openedQuery = null; return }
  const task = workspace.tasks.find(item => item.id === key)
  if (task && key !== openedQuery) { edit(task); openedQuery = key }
}, { immediate: true })
</script>
<template>
  <section class="panel tasks-panel">
    <div class="tasks-toolbar"><div class="tab-strip"><button v-for="tab in tabs" :key="tab.key" :class="{ active: filter === tab.key }" @click="filter = tab.key">{{ tab.label }}<span>{{ tab.count }}</span></button></div><div class="filter-tools"><el-input v-model="query" placeholder="筛选任务" aria-label="筛选任务" clearable><template #prefix><AppIcon name="search" :size="16" /></template></el-input><el-select v-model="priority" aria-label="优先级筛选" style="width:130px"><el-option label="全部优先级" value="all" /><el-option label="高优先级" value="high" /><el-option label="普通" value="normal" /><el-option label="低优先级" value="low" /></el-select></div></div>
    <div v-if="visible.length" class="task-list full-list"><TaskRow v-for="task in visible" :key="task.id" :task="task" :today="today" removable @edit="edit" @remove="remove" /></div>
    <EmptyState v-else icon="list" :title="workspace.tasks.length ? '没有符合条件的任务' : '从一件小事开始'" :description="workspace.tasks.length ? '试着换一个关键词或筛选条件。' : '把要做的事写下来，让思绪轻一点。'" :action="workspace.tasks.length ? '' : '添加第一条任务'" @action="add" />
    <div class="list-footer"><span>共 {{ filtered.length }} 项任务</span><el-pagination v-if="filtered.length > pageSize" v-model:current-page="page" :page-size="pageSize" :total="filtered.length" layout="prev, pager, next" /></div>
  </section>
  <div class="tip-line"><AppIcon name="done" :size="16" /> 点击左侧圆圈完成任务，点击标题查看和编辑详情。</div>
  <TaskDialog v-model="dialog" :task="selected" />
</template>
