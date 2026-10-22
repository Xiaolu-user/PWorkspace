<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useWorkspace } from '../stores/workspace'
import { useEditor } from '../stores/editor'
import { localDate } from '../../../shared/date'
import { isReminderActive, compareReminderTasks, reminderLabel } from '../../../shared/reminders'
import ReminderNotice from '../components/ReminderNotice.vue'
import { coursesOn, semesterWeek, emptySemester, type PlannerData, type LocalEntry } from '../../../shared/planner'
import type { Task } from '../../../shared/types'
import AppIcon from '../components/AppIcon.vue'
import TaskDialog from '../components/TaskDialog.vue'
import PlannerDialogs from '../components/PlannerDialogs.vue'
import TaskCalendar from '../components/TaskCalendar.vue'
import { unwrap, report, openLink, formatTime } from '../lib/api'
const ws = useWorkspace(); const editor = useEditor(); const router = useRouter(); const route = useRoute()
const now = ref(new Date()); const today = computed(() => localDate(now.value))
const clock = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }))
const dateLabel = computed(() => now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }))
const data = ref<PlannerData>({ semester: emptySemester(), workouts: [], entries: [] })
const plan = ref<'courses' | 'fitness' | null>(null); const taskDialog = ref(false); const selected = ref<Task | null>(null)
const calendarOpen = ref(false)
const filter = ref('all'); const addShortcut = ref(false); const shortcutTitle = ref(''); const shortcutUrl = ref(''); const savingLink = ref(false)
const todayTasks = computed(() => ws.tasks.filter(t => t.dueDate === today.value || isReminderActive(t, ws.now)).sort((a, b) => compareReminderTasks(a, b, ws.now)))
const done = computed(() => todayTasks.value.filter(t => t.status === 'done').length)
const percent = computed(() => todayTasks.value.length ? Math.round(done.value / todayTasks.value.length * 100) : 0)
const apps = computed(() => data.value.entries.filter(e => e.kind === 'app'))
const files = computed(() => data.value.entries.filter(e => e.kind === 'file'))
const shortcuts = computed(() => [ ...(filter.value !== 'web' ? apps.value.map(a => ({ id: a.id, title: a.title.replace(/\.(exe|lnk)$/i, ''), icon: a.icon, url: '', kind: 'app' })) : []), ...(filter.value !== 'app' ? ws.bookmarks.map(b => ({ id: b.id, title: b.title, icon: '', url: b.url, kind: 'web' })) : []) ])
const week = computed(() => semesterWeek(data.value.semester.startDate, today.value))
const weekDays = computed(() => {
  const monday = new Date(now.value); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); const date = localDate(d); return { date, number: d.getDate(), label: ['一', '二', '三', '四', '五', '六', '日'][i], courses: coursesOn(data.value.semester, date) } })
})
const selectedDay = ref(localDate()); const dayCourses = computed(() => coursesOn(data.value.semester, selectedDay.value))
const workout = computed(() => data.value.workouts.find(w => w.day === (now.value.getDay() + 6) % 7 + 1))
let timer: ReturnType<typeof setInterval>; let request = 0
async function load(): Promise<void> { const n = ++request; try { const value = unwrap(await window.workbench.planner.get()); if (n === request) data.value = value } catch (e) { report(e) } }
watch(() => ws.revision, () => void load())
watch(plan, value => { if (!value && ['courses', 'fitness'].includes(String(route.query.panel))) void router.replace('/') })
watch(() => route.query.panel, panel => { if (panel === 'courses' || panel === 'fitness') plan.value = panel; else if (panel === 'files') document.getElementById('home-files')?.scrollIntoView({ behavior: 'smooth' }) }, { immediate: true })
watch(() => editor.body, body => { editor.title = body.trim().split('\n')[0].slice(0, 80) || '' })
function tick(): void { const before = today.value; now.value = new Date(); if (before !== today.value) { selectedDay.value = today.value; void ws.refresh() } }
onMounted(() => { if (!editor.dirty) editor.select(null); timer = setInterval(tick, 1000); window.addEventListener('focus', tick); void load() })
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('focus', tick) })
function addTask(): void { selected.value = null; taskDialog.value = true }
function editTask(task: Task): void { selected.value = task; taskDialog.value = true }
const toggling = ref(new Set<string>())
async function toggle(task: Task): Promise<void> { if (toggling.value.has(task.id)) return; toggling.value.add(task.id); await ws.mutate(() => window.workbench.tasks.update(task.id, { ...task, status: task.status === 'done' ? 'todo' : 'done' }), task.status === 'done' ? '已取消完成' : '任务已完成'); toggling.value.delete(task.id) }
async function saveIdea(): Promise<void> { if (editor.body.trim() && await editor.save()) editor.select(null) }
async function pick(kind: 'app' | 'file' | 'folder'): Promise<void> { try { unwrap(await window.workbench.planner.pick(kind)); await load() } catch (e) { report(e) } }
async function openLocal(id: string): Promise<void> { try { unwrap(await window.workbench.planner.open(id)) } catch (e) { report(e) } }
async function removeEntry(entry: Pick<LocalEntry, 'id' | 'title'>, kind = 'file'): Promise<void> {
  try { await ElMessageBox.confirm(`移除“${entry.title}”的入口？原文件不会删除。`, '移除入口', { confirmButtonText: '移除', cancelButtonText: '取消' }); if (kind === 'web') await ws.mutate(() => window.workbench.bookmarks.remove(entry.id), '链接已删除'); else { unwrap(await window.workbench.planner.remove(entry.id)); await load() } } catch (e) { if (e !== 'cancel' && e !== 'close') report(e) }
}
async function saveLink(): Promise<void> { savingLink.value = true; const ok = await ws.mutate(() => window.workbench.bookmarks.create({ title: shortcutTitle.value, url: shortcutUrl.value, group: '快捷方式' }), '快捷方式已添加'); savingLink.value = false; if (ok) { addShortcut.value = false; shortcutTitle.value = ''; shortcutUrl.value = '' } }
function courseStatus(start: string, end: string): string { if (selectedDay.value !== today.value) return ''; return clock.value >= end ? '已结束' : clock.value >= start ? '进行中' : '即将开始' }
</script>
<template>
  <h1 class="sr-only">今日概览</h1>
  <div class="home-grid">
    <div class="home-column home-left">
      <section class="home-card time-card" :style="ws.moduleStyle('time')"><div class="card-label"><AppIcon name="clock" />此刻</div><time>{{ clock }}</time><div class="time-date-row"><p>{{ dateLabel }}</p><button class="icon-button calendar-trigger" aria-label="打开日历" title="打开日历，安排待办" aria-haspopup="dialog" :aria-expanded="calendarOpen" @click="calendarOpen = true"><AppIcon name="calendar" :size="20" /></button></div><svg class="time-leaves" viewBox="0 0 150 200" aria-hidden="true"><path d="M80 200Q130 90 140 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M110 125Q25 130 28 60Q96 65 110 125M130 70Q76 50 85 10Q138 25 130 70M90 175Q145 125 150 90Q107 100 90 175" fill="currentColor"/></svg></section>
      <section class="home-card home-tasks" :style="ws.moduleStyle('todos')"><header><h2><AppIcon name="done" />今日待办</h2><span class="muted">{{ done }} / {{ todayTasks.length }}</span><button class="icon-button" aria-label="添加任务" @click="addTask"><AppIcon name="plus" /></button></header><p class="home-caption">今天的重点，逐一完成。已触发的提醒会置顶显示。</p>
        <div class="home-task-list"><div v-for="task in todayTasks" :key="task.id" class="home-task" :class="{ completed: task.status === 'done', 'reminder-active': isReminderActive(task, ws.now), 'reminder-flashing': isReminderActive(task, ws.now) && !task.reminderAcknowledgedAt }"><input type="checkbox" :checked="task.status === 'done'" :disabled="toggling.has(task.id)" :aria-label="'完成任务：' + task.title" @change="toggle(task)" /><button @click="editTask(task)"><strong>{{ task.title }}<i v-if="task.priority === 'high'" class="priority-dot"></i></strong><small>{{ task.description || '给今天留一点进步' }}</small><small v-if="task.dueTime">{{ task.dueDate !== today ? task.dueDate + ' ' : '' }}{{ task.dueTime }}<template v-if="task.remindBefore !== null"> · {{ reminderLabel(task.remindBefore) }}</template></small></button><button class="icon-button" :aria-label="'编辑' + task.title" @click="editTask(task)"><AppIcon name="more" :size="15" /></button><ReminderNotice :task="task" /></div><div v-if="!todayTasks.length" class="home-empty"><AppIcon name="done" :size="32" /><p>今天的日程，留白也很好</p><small>添加任务，开始安排今天。</small></div></div>
        <div class="task-progress"><div><i :style="{ width: percent + '%' }"></i></div><span>{{ percent }}%</span></div><p class="home-caption">已完成 {{ done }} 项，还有 {{ todayTasks.length - done }} 项</p><button class="soft-button" @click="addTask">＋ 添加今日待办</button><router-link v-if="ws.dashboard.overdue.length" class="overdue-link" to="/tasks">还有 {{ ws.dashboard.overdue.length }} 项逾期任务，前往处理 →</router-link>
      </section>
    </div>
    <div class="home-column home-center">
      <section class="home-card shortcut-card" :style="ws.moduleStyle('shortcuts')"><header><span class="card-label"><AppIcon name="grid" />快捷方式</span><el-dropdown trigger="click" @command="(c: string) => c === 'web' ? addShortcut = true : pick('app')"><button class="outline-button">＋ 添加</button><template #dropdown><el-dropdown-menu><el-dropdown-item command="app">添加应用</el-dropdown-item><el-dropdown-item command="web">添加网页</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header><h2 class="shortcut-title">常用，一触即达</h2><p class="home-caption">高频工具与网站，提升效率。</p><div class="compact-tabs"><button v-for="f in [{ id: 'all', label: '全部' }, { id: 'app', label: '应用' }, { id: 'web', label: '网页' }]" :key="f.id" :class="{ active: filter === f.id }" @click="filter = f.id">{{ f.label }}</button></div>
        <div class="shortcut-grid"><div v-for="(s, i) in shortcuts" :key="s.kind + s.id" class="shortcut-tile"><button class="shortcut-open" :title="s.title" @click="s.kind === 'web' ? openLink(s.url) : openLocal(s.id)"><img v-if="s.icon" :src="s.icon" alt="" /><span v-else class="shortcut-monogram" :class="'tint-' + i % 4">{{ s.title.slice(0, 1).toUpperCase() }}</span><span>{{ s.title }}</span></button><button class="tile-remove" :aria-label="'移除' + s.title" @click="removeEntry(s, s.kind)">×</button></div><button v-if="!shortcuts.length" class="shortcut-placeholder" aria-label="添加网页快捷方式" @click="addShortcut = true"><AppIcon name="plus" :size="25" /><span>添加网页</span></button></div><p v-if="!shortcuts.length" class="home-caption">把常用应用和网页放在这里。上方“添加”可选择本机应用。</p>
      </section>
      <section class="home-card inspiration-card" :style="ws.moduleStyle('ideas')"><header><h2><AppIcon name="edit" />灵感速记</h2><small class="muted">{{ editor.dirty ? '未保存' : '随手记录' }}</small></header><p class="home-caption">随时捕捉，一闪而过的想法。</p><div class="idea-input" @click="($refs.idea as HTMLTextAreaElement)?.focus()"><textarea ref="idea" v-model="editor.body" :disabled="editor.saving" aria-label="灵感内容" placeholder="此刻，你在想什么？&#10;点击空白处，开始记录…" @keydown.ctrl.enter.prevent="saveIdea" /><div><small>Ctrl + Enter 保存</small><el-button type="primary" :disabled="!editor.body.trim()" :loading="editor.saving" @click.stop="saveIdea">记录</el-button></div></div><button v-for="note in ws.notes.slice(0, 2)" :key="note.id" class="idea-row" @click="router.push({ path: '/notes', query: { id: note.id } })"><AppIcon name="document" :size="17" /><span>{{ note.title }}</span><small>{{ formatTime(note.updatedAt) }}</small></button>
      </section>
    </div>
    <div class="home-column home-right">
      <section class="home-card courses-card" :style="ws.moduleStyle('courses')"><header><h2><AppIcon name="notebook" />本周课程</h2><button class="text-link" @click="plan = 'courses'">＋ 学期课程</button></header><p class="home-caption">{{ data.semester.title || '还没有设置学期' }}<span v-if="data.semester.startDate"> · {{ week < 1 ? '尚未开学' : week > data.semester.weeks ? '学期已结束' : `第 ${week} 周` }}</span></p><div class="week-strip"><button v-for="d in weekDays" :key="d.date" :class="{ active: selectedDay === d.date, 'is-today': d.date === today }" @click="selectedDay = d.date"><span>{{ d.label }}</span><strong>{{ d.number }}</strong></button></div><div class="week-overview"><div v-for="d in weekDays" :key="d.date" :class="{ current: d.date === today }"><button v-for="c in d.courses" :key="c.id" :title="`${c.start} ${c.title} ${c.room}`" @click="selectedDay = d.date"><span>{{ c.start }}</span>{{ c.title }}</button></div></div><header class="course-subhead"><strong>{{ selectedDay === today ? '今天' : selectedDay.slice(5) }} · {{ dayCourses.length }} 节课</strong><button class="text-link" @click="plan = 'courses'">编辑课表 →</button></header><div class="course-agenda"><div v-for="c in dayCourses" :key="c.id" class="course-row"><span>{{ c.start }}—{{ c.end }}</span><div><strong>{{ c.title }}</strong><small>{{ c.room || '未设置教室' }}</small></div><small class="course-status">{{ courseStatus(c.start, c.end) }}</small></div><p v-if="!dayCourses.length" class="home-caption">{{ data.semester.startDate ? '这一天没有课程，自由安排时间。' : '创建一学期课程，自动显示每周日程。' }}</p></div></section>
      <section class="home-card fitness-card" :style="ws.moduleStyle('fitness')"><header><h2><AppIcon name="fitness" />今日健身</h2><button class="text-link" @click="plan = 'fitness'">制定计划 ↗</button></header><div class="workout-summary"><h3>{{ workout?.title || '休息与恢复' }}</h3><strong v-if="workout">{{ workout.minutes }} <small>分钟</small></strong></div><div v-if="workout" class="exercise-list"><span v-for="(line, i) in workout.exercises.split('\n').filter(Boolean)" :key="i">{{ line }}</span></div><p v-else class="home-caption">今天暂无训练计划，让身体充分休息。</p></section>
      <section id="home-files" class="home-card files-card" :style="ws.moduleStyle('files')"><header><h2><AppIcon name="folder" />常用资料</h2><el-dropdown trigger="click" @command="pick"><button class="icon-button" aria-label="添加资料"><AppIcon name="plus" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="file">选择文件</el-dropdown-item><el-dropdown-item command="folder">选择文件夹</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header><div class="file-list"><div v-for="f in files" :key="f.id" class="file-row"><button :title="f.path" @click="openLocal(f.id)"><img v-if="f.icon" :src="f.icon" alt="" /><AppIcon v-else name="document" /><span><strong>{{ f.title }}</strong><small>{{ f.path }}</small></span></button><button class="icon-button" :aria-label="'移除' + f.title" @click="removeEntry(f)">×</button></div></div><button class="file-add" @click="pick('file')"><AppIcon name="add" :size="17" />点击添加文件入口</button><small class="file-hint">文件保留在原位置，移除入口不会删除文件。</small></section>
    </div>
  </div>
  <TaskDialog v-model="taskDialog" :task="selected" :default-date="today" />
  <TaskCalendar v-model="calendarOpen" :today="today" />
  <PlannerDialogs v-model="plan" :data="data" @saved="load" />
  <el-dialog v-model="addShortcut" title="添加网页快捷方式" width="440px" :close-on-click-modal="false"><el-form label-position="top" :disabled="savingLink"><el-form-item label="名称"><el-input v-model="shortcutTitle" placeholder="例如：GitHub" /></el-form-item><el-form-item label="网址"><el-input v-model="shortcutUrl" placeholder="https://" @keydown.enter="saveLink" /></el-form-item></el-form><template #footer><el-button @click="addShortcut = false">取消</el-button><el-button type="primary" :loading="savingLink" @click="saveLink">添加</el-button></template></el-dialog>
</template>
