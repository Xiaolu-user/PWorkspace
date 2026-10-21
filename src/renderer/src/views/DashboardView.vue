<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspace } from '../stores/workspace'
import { localDate } from '../../../shared/date'
import type { Task } from '../../../shared/types'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import TaskRow from '../components/TaskRow.vue'
import TaskDialog from '../components/TaskDialog.vue'
import { formatTime, openLink } from '../lib/api'

const workspace = useWorkspace()
const router = useRouter()
const tab = ref<'today' | 'overdue'>('today')
const dialog = ref(false)
const selected = ref<Task | null>(null)
const summary = computed(() => workspace.dashboard)
const today = computed(() => { void workspace.revision; return localDate() })
const visibleTasks = computed(() => summary.value[tab.value].slice(0, 6))
const completed = computed(() => {
  const total = summary.value.totalTodo + summary.value.totalDone
  return total ? Math.round(summary.value.totalDone / total * 100) : 0
})
const stats = computed(() => [
  { title: '待完成任务', value: summary.value.totalTodo, icon: 'list', color: 'green', path: '/tasks', hint: '一步一步，慢慢完成' },
  { title: '已经完成', value: summary.value.totalDone, icon: 'done', color: 'blue', path: '/tasks?status=done', hint: '每一小步，都算数' },
  { title: '随手记录', value: summary.value.noteCount, icon: 'document', color: 'amber', path: '/notes', hint: '留住想法与灵感' },
  { title: '收藏链接', value: summary.value.bookmarkCount, icon: 'link', color: 'purple', path: '/bookmarks', hint: '让好内容触手可及' }
])
function edit(task: Task): void { selected.value = task; dialog.value = true }
function add(): void { selected.value = null; dialog.value = true }
</script>

<template>
  <section class="welcome-card">
    <div class="welcome-copy"><span class="pill-label"><AppIcon name="sun" :size="14" /> 给今天一个清晰的开始</span><h2>把今天，过得有条理。</h2><p v-if="summary.totalTodo">还有 <strong>{{ summary.totalTodo }}</strong> 件事等待完成，先从最重要的一件开始。</p><p v-else>记下一件小事、一个灵感，让忙碌的日常有序一点。</p><button class="text-link" @click="add">写下今天的第一步 <AppIcon name="right" :size="16" /></button></div>
    <div class="welcome-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-orbit orbit-three"></div><div class="art-card art-card-back"></div><div class="art-card art-card-front"><span class="art-dot"></span><i></i><i></i><i></i><span class="art-check">✓</span></div><span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✧</span></div>
  </section>
  <div class="stats-grid">
    <button v-for="stat in stats" :key="stat.title" class="stat-card" @click="router.push(stat.path)"><span class="stat-icon" :class="stat.color"><AppIcon :name="stat.icon" :size="21" /></span><span class="stat-main"><span>{{ stat.title }}</span><strong>{{ stat.value }}<small>{{ stat.title === '随手记录' ? '篇' : stat.title === '收藏链接' ? '个' : '项' }}</small></strong></span><span class="stat-hint">{{ stat.hint }}<AppIcon name="right" :size="13" /></span></button>
  </div>
  <div class="dashboard-columns">
    <section class="panel today-panel">
      <div class="panel-heading"><h2><AppIcon name="list" :size="19" /> 今天要做</h2><router-link to="/tasks" class="subtle-link">全部任务 <AppIcon name="right" :size="14" /></router-link></div>
      <div class="tab-strip"><button :class="{ active: tab === 'today' }" @click="tab = 'today'">今日待办 <span>{{ summary.today.length }}</span></button><button :class="{ active: tab === 'overdue' }" @click="tab = 'overdue'">已逾期 <span :class="{ 'danger-count': summary.overdue.length }">{{ summary.overdue.length }}</span></button></div>
      <div class="task-list"><TaskRow v-for="task in visibleTasks" :key="task.id" :task="task" :today="today" @edit="edit" /></div>
      <EmptyState v-if="!visibleTasks.length" compact :icon="tab === 'today' ? 'done' : 'calendar'" :title="tab === 'today' ? '今天的日程，留白也很好' : '没有逾期任务'" :description="tab === 'today' ? '添加一条待办，或给已有任务设置今天的截止日期。' : '保持自己的节奏，继续向前。'" />
      <button class="panel-add" @click="add"><AppIcon name="plus" :size="17" /> 添加任务</button>
    </section>
    <section class="panel rhythm-panel">
      <div class="panel-heading"><h2>一点点，积累成很多</h2><AppIcon name="sun" :size="20" /></div>
      <div class="progress-ring" :style="{ background: `conic-gradient(var(--primary) ${completed}%, #edf1ee 0)` }"><div><strong>{{ completed }}<small>%</small></strong><span>任务完成比例</span></div></div>
      <p class="rhythm-caption">已完成 <strong>{{ summary.totalDone }}</strong> / {{ summary.totalTodo + summary.totalDone }} 项任务</p>
      <div class="gentle-note"><span>“</span><p>不必一次做好所有事。<br />把眼前的一件事，认真做好。</p></div>
    </section>
  </div>
  <section class="panel recent-panel">
    <div class="panel-heading"><h2><AppIcon name="document" :size="19" /> 最近的笔记</h2><router-link to="/notes" class="subtle-link">查看全部 <AppIcon name="right" :size="14" /></router-link></div>
    <div v-if="summary.recentNotes.length" class="note-card-grid"><button v-for="note in summary.recentNotes" :key="note.id" class="note-card" @click="router.push({ path: '/notes', query: { id: note.id } })"><span class="note-card-icon"><AppIcon name="document" :size="18" /></span><strong>{{ note.title }}</strong><p>{{ note.body || '这篇笔记还没有正文。' }}</p><span class="note-card-time">{{ formatTime(note.updatedAt) }} 更新</span></button></div>
    <EmptyState v-else compact icon="document" title="灵感，值得被记住" description="从一段文字开始，建立属于你的记录。" action="写一篇笔记" @action="router.push('/notes')" />
  </section>
  <section class="panel links-panel">
    <div class="panel-heading"><h2><AppIcon name="link" :size="19" /> 常用链接</h2><router-link to="/bookmarks" class="subtle-link">管理链接 <AppIcon name="right" :size="14" /></router-link></div>
    <div v-if="summary.bookmarks.length" class="quick-links"><button v-for="(bookmark, index) in summary.bookmarks" :key="bookmark.id" class="quick-link" @click="openLink(bookmark.url)"><span class="link-letter" :class="['green', 'blue', 'amber', 'purple'][index % 4]">{{ bookmark.title.slice(0, 1).toUpperCase() }}</span><span><strong>{{ bookmark.title }}</strong><small>{{ bookmark.group }}</small></span><AppIcon name="right" :size="14" /></button></div>
    <EmptyState v-else compact icon="link" title="把常去的网站，放在手边" action="添加常用链接" @action="router.push('/bookmarks?new=1')" />
  </section>
  <TaskDialog v-model="dialog" :task="selected" />
</template>
