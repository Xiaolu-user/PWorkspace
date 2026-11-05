<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { emptySemester, upgradeSemester, courseOccurrences, courseConflicts, parseWeeks, formatWeeks, encodeSemesterShare, decodeSemesterShare, type Semester, type Course, type CourseSchedule, type CourseOccurrence, type CourseTime } from '../../../shared/planner'
import { isValidDate } from '../../../shared/date'
import { unwrap, report } from '../lib/api'
import { useWorkspace } from '../stores/workspace'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ modelValue: boolean; semester: Semester }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const ws = useWorkspace()
const draft = ref<Semester>(emptySemester()), saving = ref(false), query = ref(''), selectedId = ref(''), expanded = ref('')
const courseGuide = ref(false)
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
// 课表分享码：导入（替换草稿）与分享（基于当前草稿生成）。
const importOpen = ref(false), importCode = ref(''), importParsed = ref<Semester | null>(null), importError = ref(''), importStartDate = ref('')
const importScheduleCount = ref(0), importOccurrenceCount = ref(0), importConflicts = ref(0)
const importFileInput = ref<HTMLInputElement | null>(null)
const startDateChanged = computed(() => !!importParsed.value && importStartDate.value !== importParsed.value.startDate)
const shareOpen = ref(false), shareInclude = ref(false), shareCode = ref(''), shareBusy = ref(false), shareCopied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function openImport(): void {
  importCode.value = ''; importParsed.value = null; importError.value = ''; importStartDate.value = ''
  importScheduleCount.value = 0; importOccurrenceCount.value = 0; importConflicts.value = 0
  importOpen.value = true
}
async function parseImportCode(): Promise<void> {
  if (!importCode.value.trim()) { importError.value = '请先粘贴分享码'; importParsed.value = null; return }
  try {
    const semester = await decodeSemesterShare(importCode.value)
    importParsed.value = semester
    importStartDate.value = semester.startDate
    importScheduleCount.value = semester.courses.reduce((sum, c) => sum + c.schedules.length, 0)
    importOccurrenceCount.value = courseOccurrences(semester).filter(o => !o.cancelled).length
    importConflicts.value = courseConflicts(courseOccurrences(semester)).length
    importError.value = ''
  } catch (error) { importParsed.value = null; importError.value = error instanceof Error ? error.message : '分享码无法解析' }
}
function readImportFile(event: Event): void {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 1024 * 1024) { importError.value = '文件过大，请直接粘贴分享码文本'; importParsed.value = null; return }
  void file.text().then(text => { importCode.value = text.trim(); return parseImportCode() })
}
async function applyImport(): Promise<void> {
  const semester = importParsed.value
  if (!semester) return
  if (!isValidDate(importStartDate.value)) { ElMessage.warning('请选择有效的开学日期，周次将以此日期计算'); return }
  if (startDateChanged.value) {
    try { await ElMessageBox.confirm('开学日期已修改，所有周次将整体平移。请确认新日期下的周次与对方课表的周次一致。', '周次平移提醒', { confirmButtonText: '仍然替换', cancelButtonText: '返回修改', type: 'warning' }) }
    catch { return }
  }
  const imported: Semester = JSON.parse(JSON.stringify({ ...semester, id: draft.value.id, slots: draft.value.slots, startDate: importStartDate.value }))
  // 重新生成全部 ID，避免与本地数据编号冲突。
  for (const course of imported.courses) { course.id = crypto.randomUUID(); for (const schedule of course.schedules) schedule.id = crypto.randomUUID() }
  draft.value = imported
  selectedId.value = imported.courses[0]?.id || ''; expanded.value = imported.courses[0]?.schedules[0]?.id || ''
  query.value = ''; showAll.value = false; editing.value = null; weekInputs.value = {}
  importOpen.value = false
  ElMessage.success('课表已导入，点击“保存课程表”后生效')
}
async function generateShare(): Promise<void> {
  shareBusy.value = true
  try { shareCode.value = await encodeSemesterShare(draft.value, { includeExceptions: shareInclude.value }) }
  catch (error) { shareCode.value = ''; report(error) } finally { shareBusy.value = false }
}
function openShare(): void { shareInclude.value = false; shareCode.value = ''; shareCopied.value = false; shareOpen.value = true; void generateShare() }
watch(shareInclude, () => { if (shareOpen.value) void generateShare() })
const shareSize = computed(() => shareCode.value ? `${(new Blob([shareCode.value]).size / 1024).toFixed(1)} KB` : '')
async function copyShare(): Promise<void> {
  if (!shareCode.value) return
  try { await navigator.clipboard.writeText(shareCode.value) }
  catch {
    const fallback = document.createElement('textarea')
    fallback.value = shareCode.value; document.body.appendChild(fallback); fallback.select()
    document.execCommand('copy'); fallback.remove()
  }
  shareCopied.value = true
  clearTimeout(copiedTimer); copiedTimer = setTimeout(() => { shareCopied.value = false }, 2000)
}
function saveShareFile(): void {
  if (!shareCode.value) return
  const blob = new Blob([shareCode.value], { type: 'text/plain;charset=utf-8' }), anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob); anchor.download = `课表分享码-${draft.value.title || '未命名学期'}.txt`
  anchor.click(); URL.revokeObjectURL(anchor.href)
}
watch(() => props.modelValue, open => {
  if (!open) return
  courseGuide.value = !props.semester.startDate && !props.semester.courses.length
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
  <el-dialog :model-value="modelValue" :title="courseGuide?'创建第一份课表':'学期课程'" :width="courseGuide?'640px':'1200px'" class="course-planner-dialog" :class="{'is-onboarding':courseGuide}" :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving && !editing" @update:model-value="emit('update:modelValue', $event)">
    <section v-if="courseGuide" class="course-first-guide"><h3>从空白开始，安排自己的学期</h3><p>先设置学期，再添加你的课程。只有点击保存后才会创建课表。</p><ol><li><b>设置学期</b><span>填写学期名称、开学日期和周数。</span></li><li><b>添加课程</b><span>为课程选择上课时间、教室和周次。</span></li><li><b>保存课表</b><span>回到首页，即可查看本周的真实安排。</span></li></ol><el-button type="primary" @click="courseGuide=false">开始设置课表</el-button></section><template v-else>
    <p class="course-planner-subtitle">一门课程，多条上课安排。周一作为每周起点。</p>
    <div class="course-font-setting">
      <AppIcon name="notebook" :size="16" />
      <span class="course-font-label">首页课程文字大小</span>
      <el-input-number v-model="courseFont" aria-label="首页课程文字大小" :min="80" :max="160" :step="5" :disabled="saving" />
      <span class="course-font-unit" aria-hidden="true">%</span>
      <span class="course-font-preview" aria-hidden="true" title="虚拟课程示例，仅用于预览文字大小" :style="{ '--preview-scale': courseFont / 100 }"><strong>示例课程</strong><small>09:00–10:30 · 教学楼 A201</small></span>
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
    </template><template #footer><template v-if="!courseGuide"><div class="course-planner-footer"><span>已设置 {{ draft.courses.length }} 门课程 · {{ draft.courses.reduce((sum,c)=>sum+c.schedules.length,0) }} 条安排 · {{ occurrenceCount }} 次上课</span><span class="course-planner-actions"><el-button :disabled="saving" @click="openImport"><AppIcon name="add" :size="14" />导入课表</el-button><el-button :disabled="saving" @click="openShare"><AppIcon name="share" :size="14" />分享课表</el-button><el-button :disabled="saving" @click="emit('update:modelValue',false)">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存课程表</el-button></span></div></template></template>
  </el-dialog>
  <el-dialog :model-value="!!editing" title="调整上课安排" width="560px" append-to-body :close-on-click-modal="false" @update:model-value="editing=null">
    <template v-if="editing"><p class="course-planner-subtitle">{{ editing.title }} · 第 {{ editing.week }} 周</p><el-radio-group v-model="editScope" aria-label="调整范围"><el-radio-button value="once">仅修改这一次</el-radio-button><el-radio-button value="schedule">修改整条安排</el-radio-button></el-radio-group><p class="course-planner-subtitle">{{ editScope==='once'?'只调整本周这一次上课，其他周不变。':'修改该安排的常规时间与地点；已单独调整的周次继续保留。' }}</p><el-form label-position="top"><el-form-item label="星期"><el-select v-model="editTime.day" aria-label="调整上课星期"><el-option v-for="(d,i) in days" :key="d" :label="'星期'+d" :value="i+1" /></el-select></el-form-item><div class="form-columns"><el-form-item label="开始时间"><el-time-picker v-model="editTime.start" format="HH:mm" value-format="HH:mm" :clearable="false" aria-label="调整开始时间" /></el-form-item><el-form-item label="结束时间"><el-time-picker v-model="editTime.end" format="HH:mm" value-format="HH:mm" :clearable="false" aria-label="调整结束时间" /></el-form-item></div><el-form-item label="教室 / 地点"><el-input v-model="editTime.room" aria-label="调整教室" maxlength="100" /></el-form-item><el-checkbox v-if="editScope==='once'" v-model="cancelled">本次停课</el-checkbox></el-form><p class="course-planner-subtitle">应用后，请在主窗口保存课程表。</p></template>
    <template #footer><el-button v-if="editing?.modified && editScope==='once'" @click="restoreOccurrence">恢复原安排</el-button><el-button @click="editing=null">取消</el-button><el-button type="primary" @click="applyOccurrence">应用调整</el-button></template>
  </el-dialog>
  <el-dialog :model-value="importOpen" title="导入课表" width="680px" append-to-body :close-on-click-modal="false" @update:model-value="importOpen=$event">
    <p class="course-planner-subtitle">粘贴同学发来的分享码，确认后替换当前正在编辑的课表（尚未保存的修改会被覆盖）；替换后点击主窗口的“保存课程表”才正式生效。</p>
    <el-input v-model="importCode" type="textarea" :rows="5" placeholder="粘贴形如 PWS1. 开头的分享码" aria-label="课表分享码" />
    <div class="share-actions">
      <el-button type="primary" :disabled="!importCode.trim()" @click="parseImportCode">解析分享码</el-button>
      <el-button @click="importFileInput?.click()">从文件导入</el-button>
      <el-tooltip content="链接导入即将上线" placement="top"><span><el-button disabled>从链接导入（即将上线）</el-button></span></el-tooltip>
      <input ref="importFileInput" type="file" accept=".txt,.pws,.json,application/json,text/plain" class="share-file-input" aria-hidden="true" tabindex="-1" @change="readImportFile" />
    </div>
    <p v-if="importError" class="share-error" role="alert">{{ importError }}</p>
    <div v-if="importParsed" class="share-preview">
      <header><strong>解析成功</strong><small>请确认以下信息后再替换</small></header>
      <div class="share-field"><span>课表名称</span><b>{{ importParsed.title || '未命名学期' }}</b></div>
      <div class="share-field"><span>开学日期</span><el-date-picker v-model="importStartDate" value-format="YYYY-MM-DD" placeholder="选择开学日期" aria-label="导入课表的开学日期" /></div>
      <div class="share-field"><span>课表规模</span><b>{{ importParsed.courses.length }} 门课程 · {{ importScheduleCount }} 条安排 · {{ importOccurrenceCount }} 次上课</b></div>
      <div class="share-field"><span>冲突检查</span><b :class="importConflicts ? 'share-conflict-warn' : 'share-conflict-ok'">{{ importConflicts ? `发现 ${importConflicts} 处时间冲突，替换后仍可调整` : '无时间冲突' }}</b></div>
      <p v-if="startDateChanged" class="share-week-warning">开学日期已修改，所有周次将整体平移，请确认与对方课表的周次一致。</p>
    </div>
    <template #footer><el-button @click="importOpen=false">取消</el-button><el-button type="primary" :disabled="!importParsed" @click="applyImport">替换当前课表</el-button></template>
  </el-dialog>
  <el-dialog :model-value="shareOpen" title="分享课表" width="680px" append-to-body @update:model-value="shareOpen=$event">
    <p class="course-planner-subtitle">分享当前编辑中的课表（包含尚未保存的修改）。对方在“学期课程 → 导入课表”粘贴分享码即可一键导入。</p>
    <el-radio-group v-model="shareInclude" :disabled="shareBusy">
      <el-radio :value="false">仅分享原始课表（推荐）</el-radio>
      <el-radio :value="true">包含单次调整与停课记录</el-radio>
    </el-radio-group>
    <div class="share-code-box">
      <el-input :model-value="shareCode" type="textarea" :rows="6" readonly aria-label="课表分享码" :placeholder="shareBusy ? '正在生成分享码…' : ''" />
      <small v-if="shareCode" class="share-size">约 {{ shareSize }} · 请完整复制，缺字符会导致对方导入失败</small>
    </div>
    <template #footer><el-button :disabled="!shareCode" @click="saveShareFile">保存为文件</el-button><el-button type="primary" :disabled="!shareCode || shareBusy" @click="copyShare">{{ shareCopied ? '已复制 ✓' : '复制分享码' }}</el-button></template>
  </el-dialog>
</template>
