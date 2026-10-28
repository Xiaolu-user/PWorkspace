<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { emptySemester, upgradeSemester, courseOccurrences, courseConflicts, parseWeeks, formatWeeks, type Semester, type Course, type CourseSchedule, type CourseOccurrence, type CourseTime } from '../../../shared/planner'
import { unwrap, report } from '../lib/api'
import { useWorkspace } from '../stores/workspace'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ modelValue: boolean; semester: Semester }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const ws = useWorkspace()
const draft = ref<Semester>(emptySemester()), saving = ref(false), query = ref(''), selectedId = ref(''), expanded = ref('')
const courseFont = ref(ws.preferences.appearance.courseFontScale)
const weekInputs = ref<Record<string, string>>({}), showAll = ref(false)
const days = ['一', '二', '三', '四', '五', '六', '日']
const selected = computed(() => draft.value.courses.find(c => c.id === selectedId.value))
const filtered = computed(() => draft.value.courses.filter(c => c.title.toLowerCase().includes(query.value.trim().toLowerCase())))
const weekCount = computed(() => Number.isInteger(draft.value.weeks) ? Math.max(1, Math.min(52, draft.value.weeks)) : 18)
const occurrences = computed(() => courseOccurrences(draft.value))
const conflicts = computed(() => courseConflicts(occurrences.value))
const preview = computed(() => occurrences.value.filter(o => o.courseId === selectedId.value))
const previewGroups = computed(() => {
  const groups = new Map<number, CourseOccurrence[]>()
  for (const row of preview.value) { const list = groups.get(row.week) || []; list.push(row); groups.set(row.week, list) }
  return [...groups].map(([week, rows]) => ({ week, rows }))
})
const visibleGroups = computed(() => showAll.value ? previewGroups.value : previewGroups.value.slice(0, 5))
const occurrenceCount = computed(() => occurrences.value.filter(o => !o.cancelled).length)
const selectedConflicts = computed(() => conflicts.value.filter(c => c.first.courseId === selectedId.value || c.second.courseId === selectedId.value))
const editing = ref<CourseOccurrence | null>(null), editScope = ref<'once' | 'schedule'>('once'), cancelled = ref(false)
const editTime = ref<CourseTime>({ day: 1, start: '08:00', end: '09:40', room: '' })
watch(() => props.modelValue, open => {
  if (!open) return
  draft.value = JSON.parse(JSON.stringify(upgradeSemester(props.semester)))
  selectedId.value = draft.value.courses[0]?.id || ''; expanded.value = draft.value.courses[0]?.schedules[0]?.id || ''
  query.value = ''; showAll.value = false; editing.value = null; weekInputs.value = {}
  courseFont.value = ws.preferences.appearance.courseFontScale
}, { immediate: true })
function choose(course: Course): void { selectedId.value = course.id; expanded.value = course.schedules[0]?.id || ''; showAll.value = false }
function makeSchedule(): CourseSchedule { return { id: crypto.randomUUID(), day: 1, start: '08:00', end: '09:40', room: '', weeks: Array.from({ length: weekCount.value }, (_, i) => i + 1), exceptions: [] } }
function addCourse(): void {
  const course: Course = { id: crypto.randomUUID(), title: '', teacher: '', color: '#17765c', schedules: [makeSchedule()] }
  draft.value.courses.push(course); query.value = ''; choose(course)
}
async function removeCourse(): Promise<void> {
  if (!selected.value) return
  const course = selected.value
  try { await ElMessageBox.confirm(`删除“${course.title || '未命名课程'}”及其 ${course.schedules.length} 条安排？保存课程表后生效。`, '删除课程', { confirmButtonText: '删除课程', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  draft.value.courses = draft.value.courses.filter(c => c.id !== course.id)
  selectedId.value = draft.value.courses[0]?.id || ''; expanded.value = draft.value.courses[0]?.schedules[0]?.id || ''
}
function addSchedule(source?: CourseSchedule): void {
  if (!selected.value) return
  const schedule = source ? { ...JSON.parse(JSON.stringify(source)), id: crypto.randomUUID() } as CourseSchedule : makeSchedule()
  selected.value.schedules.push(schedule); expanded.value = schedule.id
}
function removeSchedule(schedule: CourseSchedule): void {
  if (!selected.value) return
  selected.value.schedules = selected.value.schedules.filter(s => s.id !== schedule.id)
  if (expanded.value === schedule.id) expanded.value = selected.value.schedules[0]?.id || ''
}
function setWeeks(schedule: CourseSchedule, weeks: number[]): void {
  schedule.weeks = [...weeks].sort((a,b) => a-b)
  schedule.exceptions = schedule.exceptions.filter(e => weeks.includes(e.week))
  weekInputs.value[schedule.id] = formatWeeks(weeks).replaceAll('、', ',')
}
function toggleWeek(schedule: CourseSchedule, week: number): void { setWeeks(schedule, schedule.weeks.includes(week) ? schedule.weeks.filter(w => w !== week) : [...schedule.weeks, week]) }
function presetWeeks(schedule: CourseSchedule, mode: string): void { setWeeks(schedule, Array.from({ length: weekCount.value }, (_, i) => i+1).filter(w => mode === 'all' || mode === 'odd' && w%2 === 1 || mode === 'even' && w%2 === 0)) }
function applyWeeks(schedule: CourseSchedule): void {
  const weeks = parseWeeks(weekInputs.value[schedule.id] ?? formatWeeks(schedule.weeks), weekCount.value)
  if (weeks === null) { ElMessage.warning(`请输入 1–${weekCount.value} 内的周次，例如 3,5,8-10`); return }
  setWeeks(schedule, weeks)
}
function count(course: Course): number { return occurrences.value.filter(o => o.courseId === course.id && !o.cancelled).length }
function openOccurrence(row: CourseOccurrence): void { editing.value = row; editScope.value = 'once'; cancelled.value = row.cancelled; editTime.value = { day: row.day, start: row.start, end: row.end, room: row.room } }
function targetSchedule(): CourseSchedule | undefined { return draft.value.courses.find(c => c.id === editing.value?.courseId)?.schedules.find(s => s.id === editing.value?.scheduleId) }
watch(editScope, value => { const source = value === 'schedule' ? targetSchedule() : editing.value; if (source) { editTime.value = { day:source.day, start:source.start, end:source.end, room:source.room }; cancelled.value = value === 'once' && !!editing.value?.cancelled } })
function applyOccurrence(): void {
  const s = targetSchedule(), occurrence = editing.value, time = editTime.value
  if (!s || !occurrence) return
  if (!time.start || !time.end || time.start >= time.end) { ElMessage.warning('结束时间必须晚于开始时间'); return }
  if (editScope.value === 'schedule') Object.assign(s, time)
  else { s.exceptions = s.exceptions.filter(e => e.week !== occurrence.week); s.exceptions.push({ week: occurrence.week, cancelled: cancelled.value, ...time }) }
  editing.value = null
}
function restoreOccurrence(): void { const s = targetSchedule(); if (s && editing.value) s.exceptions = s.exceptions.filter(e => e.week !== editing.value!.week); editing.value = null }
async function save(): Promise<void> {
  if (saving.value) return
  // Do not silently discard a typed quick-entry value that was not applied yet.
  for (const c of draft.value.courses) for (const s of c.schedules) {
    if (weekInputs.value[s.id] !== undefined) {
      const weeks = parseWeeks(weekInputs.value[s.id], weekCount.value)
      if (weeks === null) { choose(c); expanded.value = s.id; ElMessage.warning('有尚未正确填写的周次，请检查快速输入'); return }
      setWeeks(s, weeks)
    }
  }
  saving.value = true
  try {
    if (conflicts.value.length) {
      try { await ElMessageBox.confirm(`发现 ${conflicts.value.length} 处上课时间重叠。可取消并查看右侧冲突详情，或核实后保留安排。`, '课程时间冲突', { confirmButtonText: '仍然保存', cancelButtonText: '返回检查', type: 'warning' }) }
      catch { return }
    }
    unwrap(await window.workbench.planner.semester(JSON.parse(JSON.stringify(draft.value))))
    if (courseFont.value !== ws.preferences.appearance.courseFontScale) ws.preferences = unwrap(await window.workbench.app.setAppearance(JSON.parse(JSON.stringify({ ...ws.preferences.appearance, courseFontScale: courseFont.value }))))
    ElMessage.success('课程表已保存'); emit('saved'); emit('update:modelValue', false)
  } catch (e) { report(e) } finally { saving.value = false }
}
</script>
<template>
  <el-dialog :model-value="modelValue" title="学期课程" width="1200px" class="course-planner-dialog" :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving && !editing" @update:model-value="emit('update:modelValue', $event)">
    <p class="course-planner-subtitle">一门课程，多条上课安排。周一作为每周起点。</p>
    <div class="course-font-setting">
      <AppIcon name="notebook" :size="16" />
      <span class="course-font-label">首页课程文字大小</span>
      <el-input-number v-model="courseFont" aria-label="首页课程文字大小" :min="80" :max="160" :step="5" :disabled="saving" />
      <span class="course-font-unit" aria-hidden="true">%</span>
      <span class="course-font-preview" aria-hidden="true" title="首页课程块效果预览" :style="{ '--preview-scale': courseFont / 100 }"><strong>机器学习</strong><small>13:30–15:05 · 獐子岛 226</small></span>
      <el-button text :disabled="saving || courseFont === 100" @click="courseFont = 100">恢复默认</el-button>
      <small class="course-font-hint">只影响首页“本周课程”中的课程名称、时间与教室，保存课程表后生效。</small>
    </div>
    <el-form label-position="top" :disabled="saving" class="semester-fields"><el-form-item label="学期名称"><el-input v-model="draft.title" placeholder="例如：2026 秋季学期" maxlength="100" /></el-form-item><el-form-item label="第一周内的开学日期"><el-date-picker v-model="draft.startDate" value-format="YYYY-MM-DD" placeholder="选择开学日期" /></el-form-item><el-form-item label="学期周数"><el-input-number v-model="draft.weeks" aria-label="学期周数" :min="1" :max="52" /></el-form-item></el-form>
    <div class="course-planner-columns">
      <aside class="course-picker"><header><h3>我的课程</h3><el-button :disabled="saving" @click="addCourse">＋ 添加课程</el-button></header><el-input v-model="query" aria-label="搜索课程" placeholder="搜索课程" clearable /><div class="course-picker-list"><button v-for="c in filtered" :key="c.id" class="course-picker-item" :class="{ active:c.id===selectedId }" :aria-pressed="c.id===selectedId" :disabled="saving" @click="choose(c)"><i :style="{ background:c.color }"></i><span><strong>{{ c.title || '未命名课程' }}</strong><small>{{ c.schedules.length }} 条安排 · {{ count(c) }} 次上课</small></span></button><p v-if="!filtered.length" class="course-empty">{{ query ? '没有匹配的课程' : '点击“添加课程”，开始安排学期。' }}</p></div></aside>
      <section v-if="selected" class="course-edit-panel" aria-label="课程编辑">
        <el-form label-position="top" :disabled="saving">
          <div class="course-basics"><header><h3>课程信息</h3><el-button text type="danger" @click="removeCourse">删除课程</el-button></header><div class="course-basic-fields"><el-form-item label="课程名称"><el-input v-model="selected.title" aria-label="课程名称" placeholder="课程名称" maxlength="100" /></el-form-item><el-form-item label="教师（选填）"><el-input v-model="selected.teacher" aria-label="教师" placeholder="教师姓名" maxlength="100" /></el-form-item><label class="course-color-label">课程颜色<input v-model="selected.color" type="color" aria-label="课程颜色" :disabled="saving" /></label></div></div>
          <div class="course-arrangements"><header><h3>上课安排</h3><el-button @click="addSchedule()">＋ 添加安排</el-button></header>
            <article v-for="(schedule,index) in selected.schedules" :key="schedule.id" class="schedule-card" :data-schedule-id="schedule.id">
              <header><button type="button" class="schedule-heading" :aria-expanded="expanded===schedule.id" @click="expanded=expanded===schedule.id?'':schedule.id"><b>{{ index+1 }}</b>安排 {{ index+1 }}<AppIcon :name="expanded===schedule.id?'left':'right'" :size="14" /></button><el-button text :aria-label="'复制安排 ' + (index+1)" @click="addSchedule(schedule)">复制</el-button><el-button text type="danger" :aria-label="'删除安排 ' + (index+1)" @click="removeSchedule(schedule)">删除</el-button></header>
              <div v-if="expanded===schedule.id" class="schedule-body">
                <div class="schedule-time-fields"><el-form-item label="星期"><el-select v-model="schedule.day" aria-label="上课星期"><el-option v-for="(d,i) in days" :key="d" :value="i+1" :label="'星期'+d" /></el-select></el-form-item><el-form-item label="开始时间"><el-time-picker v-model="schedule.start" aria-label="开始时间" format="HH:mm" value-format="HH:mm" :clearable="false" /></el-form-item><el-form-item label="结束时间"><el-time-picker v-model="schedule.end" aria-label="结束时间" format="HH:mm" value-format="HH:mm" :clearable="false" /></el-form-item></div>
                <el-form-item label="教室 / 地点"><el-input v-model="schedule.room" aria-label="教室 / 地点" placeholder="教室 / 地点" maxlength="100" /></el-form-item>
                <div class="week-selection-header"><strong>上课周次</strong><el-button v-for="mode in [{id:'all',label:'全选'},{id:'odd',label:'单周'},{id:'even',label:'双周'},{id:'none',label:'清空'}]" :key="mode.id" @click="presetWeeks(schedule,mode.id)">{{ mode.label }}</el-button></div>
                <div class="course-week-grid" aria-label="选择上课周次"><button v-for="w in weekCount" :key="w" type="button" :disabled="saving" :aria-label="'第 ' + w + ' 周'" :aria-pressed="schedule.weeks.includes(w)" @click="toggleWeek(schedule,w)">{{ w }}</button></div>
                <div class="week-quick-entry"><el-input :model-value="weekInputs[schedule.id] ?? formatWeeks(schedule.weeks).replaceAll('、', ',')" aria-label="快速输入周次" placeholder="例如：3,5,8-10" @update:model-value="weekInputs[schedule.id]=$event" @keydown.enter.prevent="applyWeeks(schedule)" /><el-button @click="applyWeeks(schedule)">应用</el-button></div><p class="week-summary">{{ schedule.weeks.length ? '已选第 ' + formatWeeks(schedule.weeks) + ' 周' : '尚未选择周次' }} · 共 {{ schedule.weeks.length - schedule.exceptions.filter(e=>e.cancelled).length }} 次上课</p>
                <p v-if="schedule.weeks.some(w=>w>weekCount)" class="course-error">存在超出学期的周次，请重新选择。</p>
                <p v-if="schedule.exceptions.length" class="week-summary">含 {{ schedule.exceptions.length }} 次单独调整或停课，可在右侧预览中查看、恢复。</p>
              </div>
              <button v-else type="button" class="schedule-summary" @click="expanded=schedule.id">星期{{ days[schedule.day-1] }} {{ schedule.start }}–{{ schedule.end }} · {{ schedule.room || '未设置教室' }}<small>第 {{ formatWeeks(schedule.weeks) || '—' }} 周 · {{ schedule.exceptions.length ? schedule.exceptions.length + ' 次单独调整' : '无单独调整' }}</small></button>
            </article>
            <button type="button" class="add-schedule" :disabled="saving" @click="addSchedule()">＋ 添加上课安排</button><p class="course-planner-subtitle">复制安排后，可单独修改时间、教室和周次；复制时会包含已有单次调整。</p>
          </div>
        </el-form>
      </section>
      <section v-else class="course-empty course-edit-panel"><AppIcon name="notebook" :size="38" /><p>添加或选择一门课程</p></section>
      <aside class="course-preview" aria-label="排课预览"><header><h3>排课预览</h3><small>修改后实时更新</small></header><p v-if="selected" class="preview-count">共 {{ selected.schedules.length }} 条安排，{{ preview.filter(o=>!o.cancelled).length }} 次上课</p><p v-if="!draft.startDate" class="course-planner-subtitle">设置开学日期后显示具体日期。</p>
        <div class="preview-week" v-for="group in visibleGroups" :key="group.week"><header><strong>第 {{ group.week }} 周</strong><small>{{ group.rows.filter(o=>!o.cancelled).length }} 次</small></header><button v-for="row in group.rows" :key="row.id" class="preview-occurrence" :class="{cancelled:row.cancelled}" :aria-label="'调整第 '+row.week+' 周星期'+days[row.day-1]+' '+row.start" :disabled="saving" @click="openOccurrence(row)"><span>周{{ days[row.day-1] }} <small>{{ row.date.slice(5) }}</small><b v-if="row.modified">{{ row.cancelled?'已停课':'已调整' }}</b></span><strong>{{ row.start }}–{{ row.end }}</strong><small>{{ row.room || '未设置教室' }}</small><em>调整本次</em></button></div>
        <el-button v-if="previewGroups.length>5" text @click="showAll=!showAll">{{ showAll?'收起预览':'展开全部 '+preview.filter(o=>!o.cancelled).length+' 次' }}</el-button>
        <div class="course-conflict-summary" :class="{warning:conflicts.length}"><strong>{{ conflicts.length ? '发现 '+conflicts.length+' 处时间冲突' : '没有时间冲突' }}</strong><p>{{ conflicts.length ? '核对后仍可保存，点击课程查看相关冲突。' : '与本学期所有课程对照，未发现时间重叠。' }}</p><p v-for="(conflict,index) in selectedConflicts.slice(0,20)" :key="index" class="course-conflict">第 {{ conflict.first.week }} 周 · 周{{ days[conflict.first.day-1] }}<br />{{ conflict.first.title || '未命名课程' }} {{ conflict.first.start }}–{{ conflict.first.end }}<br />{{ conflict.second.title || '未命名课程' }} {{ conflict.second.start }}–{{ conflict.second.end }}</p><p v-if="selectedConflicts.length>20">还有 {{ selectedConflicts.length-20 }} 处，请调整后继续查看。</p></div>
      </aside>
    </div>
    <template #footer><div class="course-planner-footer"><span>已设置 {{ draft.courses.length }} 门课程 · {{ draft.courses.reduce((sum,c)=>sum+c.schedules.length,0) }} 条安排 · {{ occurrenceCount }} 次上课</span><el-button :disabled="saving" @click="emit('update:modelValue',false)">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存课程表</el-button></div></template>
  </el-dialog>
  <el-dialog :model-value="!!editing" title="调整上课安排" width="560px" append-to-body :close-on-click-modal="false" @update:model-value="editing=null">
    <template v-if="editing"><p class="course-planner-subtitle">{{ editing.title }} · 第 {{ editing.week }} 周</p><el-radio-group v-model="editScope" aria-label="调整范围"><el-radio-button value="once">仅修改这一次</el-radio-button><el-radio-button value="schedule">修改整条安排</el-radio-button></el-radio-group><p class="course-planner-subtitle">{{ editScope==='once'?'只调整本周这一次上课，其他周不变。':'修改该安排的常规时间与地点；已单独调整的周次继续保留。' }}</p><el-form label-position="top"><el-form-item label="星期"><el-select v-model="editTime.day" aria-label="调整上课星期"><el-option v-for="(d,i) in days" :key="d" :label="'星期'+d" :value="i+1" /></el-select></el-form-item><div class="form-columns"><el-form-item label="开始时间"><el-time-picker v-model="editTime.start" format="HH:mm" value-format="HH:mm" :clearable="false" aria-label="调整开始时间" /></el-form-item><el-form-item label="结束时间"><el-time-picker v-model="editTime.end" format="HH:mm" value-format="HH:mm" :clearable="false" aria-label="调整结束时间" /></el-form-item></div><el-form-item label="教室 / 地点"><el-input v-model="editTime.room" aria-label="调整教室" maxlength="100" /></el-form-item><el-checkbox v-if="editScope==='once'" v-model="cancelled">本次停课</el-checkbox></el-form><p class="course-planner-subtitle">应用后，请在主窗口保存课程表。</p></template>
    <template #footer><el-button v-if="editing?.modified && editScope==='once'" @click="restoreOccurrence">恢复原安排</el-button><el-button @click="editing=null">取消</el-button><el-button type="primary" @click="applyOccurrence">应用调整</el-button></template>
  </el-dialog>
</template>
