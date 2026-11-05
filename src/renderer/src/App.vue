<script setup lang="ts">
const appIcon = import.meta.env.BASE_URL + 'app-icon.png'
import { ref, computed, onMounted, onBeforeUnmount, watchEffect } from 'vue'
import { localDate } from '../../shared/date'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppIcon from './components/AppIcon.vue'
import TaskDialog from './components/TaskDialog.vue'
import { useWorkspace } from './stores/workspace'
import { useEditor } from './stores/editor'
import { unwrap, report } from './lib/api'
const route = useRoute(); const router = useRouter(); const workspace = useWorkspace(); const editor = useEditor()
const fitnessCrumbs = computed(() => {
  const view=String(route.query.view||'overview')
  return ({overview:['健身计划','训练计划','概览'],cycles:['健身计划','训练计划','循环设置'],templates:['健身计划','训练计划','常用训练内容'],library:['健身计划','动作库'],calendar:['健身计划','训练记录'],stats:['健身计划','训练记录','训练统计'],compare:['训练记录','动作对比'],list:['健身计划','训练记录','记录明细'],entry:['训练记录','补录训练']} as Record<string,string[]>)[view]||['健身计划']
})
const changingTheme = ref(false)
async function toggleTheme(): Promise<void> {
  if (changingTheme.value) return
  changingTheme.value = true
  try { workspace.preferences = unwrap(await window.workbench.app.setAppearance({ ...JSON.parse(JSON.stringify(workspace.preferences.appearance)), theme: workspace.preferences.appearance.theme === 'dark' ? 'light' : 'dark' })) }
  catch (error) { report(error) } finally { changingTheme.value = false }
}
const search = ref(''); const addTask = ref(false); const now = ref(new Date())
watchEffect(() => {
  const appearance = workspace.preferences.appearance
  document.documentElement.dataset.theme = appearance.theme
  document.documentElement.classList.toggle('dark', appearance.theme === 'dark')
  const style = document.documentElement.style
  style.setProperty('--wallpaper-color', appearance.backgroundColor)
  style.setProperty('--wallpaper-image', appearance.backgroundImage ? `url("${appearance.backgroundImage}")` : 'none')
  style.setProperty('--text-scale', String(appearance.fontScale / 100))
  style.setProperty('--dialog-scale', String(appearance.dialogScale / 100))
  style.setProperty('--dialog-text-scale', String(appearance.fontScale * appearance.dialogFontScale / 10000))
})
const todayLabel = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
// The rail is icon-only; each item grows into a labelled card on hover, and its neighbours swell with it.
const navigation = computed(() => [
  { path: '/', icon: 'grid', label: '今日概览', hint: '待办、课程与入口' },
  { path: '/tasks', icon: 'list', label: '我的待办', hint: workspace.dashboard.totalTodo ? `${workspace.dashboard.totalTodo} 项未完成` : '还没有待办' },
  { path: '/courses', icon: 'calendar', label: '课程表', hint: '整周与整学期课程' },
  { path: '/fitness', icon: 'fitness', label: '健身计划', hint: '周期安排与训练回顾' },
  { path: '/?panel=files', icon: 'folder', label: '常用资料', hint: '文件一键打开' },
  { path: '/notes', icon: 'document', label: '随手笔记', hint: '灵感与记录' },
  { path: '/bookmarks', icon: 'link', label: '常用链接', hint: '常去的地方' }
])
const hoverIndex = ref(-1)
const quickIndex = computed(() => navigation.value.length + 1)
const bottomIndex = (index: number): number => navigation.value.length + 2 + index
function waveOf(index: number): string {
  const distance = Math.abs(index - hoverIndex.value)
  return hoverIndex.value < 0 ? '' : distance === 1 ? 'wave-1' : distance === 2 ? 'wave-2' : ''
}
async function openData(): Promise<void> { try { unwrap(await window.workbench.app.openDataDirectory()) } catch (cause) { report(cause) } }
let unsubscribe: (() => void) | undefined; let clock: ReturnType<typeof setInterval>
function doSearch(): void { const q = search.value.trim(); if (route.path==='/fitness') { void router.push({path:'/fitness',query:{view:'library',q}}); return } void router.push({ path: '/search', query: q ? { q } : {} }) }
async function onKeyboard(event: KeyboardEvent): Promise<void> {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (route.path === '/notes') await editor.save()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus() }
}
onMounted(async () => {
  window.addEventListener('keydown', onKeyboard)
  clock = setInterval(() => { const before = now.value.toDateString(); now.value = new Date(); workspace.now = now.value.getTime(); if (now.value.toDateString() !== before) void workspace.refresh() }, 1000)
  if (window.workbench) {
    unsubscribe = window.workbench.app.onRequestClose(async token => {
      try { const allow = await editor.requestLeave(); unwrap(await window.workbench.app.respondClose(token, allow)) } catch (cause) { report(cause) }
    })
  }
  await workspace.refresh()
  try { if (window.workbench) unwrap(await window.workbench.app.ready()) } catch (cause) { report(cause) }
  if (workspace.info?.startupWarning) ElMessage.warning({ message: workspace.info.startupWarning, duration: 8000 })
})
onBeforeUnmount(() => { clearInterval(clock); unsubscribe?.(); window.removeEventListener('keydown', onKeyboard) })
</script>
<template>
  <div class="app-shell compact-shell" :class="{ 'is-dashboard': route.path === '/', 'is-fitness': route.path === '/fitness' }">
    <aside class="sidebar">
      <router-link to="/" class="brand" aria-label="大内总管首页" :class="waveOf(0)" @mouseenter="hoverIndex = 0" @mouseleave="hoverIndex = -1"><img class="brand-mark brand-image" :src="appIcon" alt="大内总管图标" /><span class="nav-label"><strong>大内总管</strong><em>本地个人空间</em></span></router-link>
      <nav class="primary-nav" aria-label="主要导航"><router-link v-for="(item, index) in navigation" :key="item.path" :to="item.path" :aria-label="item.label" :class="[waveOf(index + 1), { active: route.path === item.path }]" @mouseenter="hoverIndex = index + 1" @mouseleave="hoverIndex = -1"><AppIcon :name="item.icon" :size="20" /><span class="nav-label"><strong>{{ item.label }}</strong><em>{{ item.hint }}</em></span><small v-if="item.path === '/tasks' && workspace.dashboard.totalTodo">{{ workspace.dashboard.totalTodo }}</small></router-link></nav>
      <div class="sidebar-divider"></div>
      <button class="quick-create" aria-label="快速添加任务" :class="waveOf(quickIndex)" @mouseenter="hoverIndex = quickIndex" @mouseleave="hoverIndex = -1" @click="addTask = true"><AppIcon name="plus" :size="19" /><span class="nav-label"><strong>快速添加</strong><em>新建一条待办</em></span></button>
      <div class="sidebar-bottom">
        <button class="side-chip" aria-label="你的数据只在本机" :class="waveOf(bottomIndex(0))" @mouseenter="hoverIndex = bottomIndex(0)" @mouseleave="hoverIndex = -1" @click="openData"><AppIcon name="lock" :size="19" /><span class="nav-label"><strong>数据只在本机</strong><em>离线也能记录</em></span></button>
        <button class="side-chip" :disabled="changingTheme" :aria-label="workspace.preferences.appearance.theme === 'dark' ? '切换日间模式' : '切换夜间模式'" :class="waveOf(bottomIndex(1))" @mouseenter="hoverIndex = bottomIndex(1)" @mouseleave="hoverIndex = -1" @click="toggleTheme"><AppIcon :name="workspace.preferences.appearance.theme === 'dark' ? 'sun' : 'moon'" :size="20" /><span class="nav-label"><strong>切换主题</strong><em>{{ workspace.preferences.appearance.theme === 'dark' ? '当前深色' : '当前浅色' }}</em></span></button>
        <router-link to="/settings" class="settings-nav" aria-label="设置与备份" :class="[waveOf(bottomIndex(2)), { active: route.path === '/settings' }]" @mouseenter="hoverIndex = bottomIndex(2)" @mouseleave="hoverIndex = -1"><AppIcon name="setting" :size="19" /><span class="nav-label"><strong>设置与备份</strong><em>外观与数据</em></span></router-link>
        <div class="side-chip me" :class="waveOf(bottomIndex(3))" @mouseenter="hoverIndex = bottomIndex(3)" @mouseleave="hoverIndex = -1"><span class="avatar">我</span><span class="nav-label"><strong>我的工作台</strong><em>留一点时间给自己</em></span></div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><strong class="toolbar-brand">大内总管</strong><template v-if="route.path === '/fitness'"><template v-for="(crumb,index) in fitnessCrumbs"><span class="fitness-crumb-separator">{{ index===0?'│':'›' }}</span><span class="fitness-crumb">{{ crumb }}</span></template></template><template v-else-if="route.path !== '/'"><span>/</span><span>{{ route.meta.title }}</span></template></div><div class="topbar-right"><el-input v-model="search" class="global-search" :placeholder="route.path==='/fitness'?'搜索动作名称、肌肉或标签…':'搜索任务、笔记、链接'" aria-label="全局搜索" clearable @keydown.enter="doSearch"><template #prefix><AppIcon name="search" :size="17" /></template><template #suffix><kbd>↵</kbd></template></el-input><span class="topbar-divider"></span><span class="online-status"><span class="status-dot"></span>本地模式</span></div></header>
      <main class="page-scroll">
        <div v-if="route.path !== '/' && route.path !== '/courses' && route.path !== '/fitness'" class="page-header"><div><div class="eyebrow">MY PERSONAL SPACE</div><h1>{{ route.meta.title }}</h1><p>{{ route.meta.subtitle }}</p></div><el-button v-if="route.path === '/tasks'" type="primary" class="primary-add" @click="addTask = true"><AppIcon name="plus" :size="17" />添加任务</el-button></div>
        <div v-if="workspace.error" class="error-banner" role="alert"><AppIcon name="warning" /><span>{{ workspace.error }}</span><el-button text :loading="workspace.loading" @click="workspace.refresh">重新加载</el-button></div>
        <router-view />
        <footer class="page-footer"><span>大内总管 · 把日常，慢慢整理好。</span><span><span class="status-dot"></span>本地保存 · {{ workspace.info ? `v${workspace.info.version}` : '正在连接' }}</span></footer>
      </main>
    </div>
    <TaskDialog v-model="addTask" :default-date="route.path === '/' ? localDate() : undefined" />
    <el-dialog :model-value="editor.leaveDialog" title="还有未保存的笔记" width="460px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false"><p class="dialog-copy">离开前，要保存这次修改吗？</p><template #footer><el-button :disabled="editor.saving" @click="editor.decide('cancel')">取消</el-button><el-button :disabled="editor.saving" @click="editor.decide('discard')">放弃修改</el-button><el-button type="primary" :loading="editor.saving" @click="editor.decide('save')">保存并继续</el-button></template></el-dialog>
  </div>
</template>
