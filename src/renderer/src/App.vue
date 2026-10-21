<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppIcon from './components/AppIcon.vue'
import TaskDialog from './components/TaskDialog.vue'
import { useWorkspace } from './stores/workspace'
import { useEditor } from './stores/editor'
import { unwrap, report } from './lib/api'
const route = useRoute(); const router = useRouter(); const workspace = useWorkspace(); const editor = useEditor()
const search = ref(''); const addTask = ref(false); const now = ref(new Date())
const todayLabel = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
const navigation = [{ path: '/', icon: 'grid', label: '今日概览' }, { path: '/tasks', icon: 'list', label: '我的待办' }, { path: '/notes', icon: 'document', label: '随手笔记' }, { path: '/bookmarks', icon: 'link', label: '常用链接' }]
let unsubscribe: (() => void) | undefined; let clock: ReturnType<typeof setInterval>
function doSearch(): void { const q = search.value.trim(); void router.push({ path: '/search', query: q ? { q } : {} }) }
async function onKeyboard(event: KeyboardEvent): Promise<void> {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (route.path === '/notes') await editor.save()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus() }
}
onMounted(async () => {
  window.addEventListener('keydown', onKeyboard)
  clock = setInterval(() => { const before = now.value.toDateString(); now.value = new Date(); if (now.value.toDateString() !== before) void workspace.refresh() }, 30000)
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
  <div class="app-shell">
    <aside class="sidebar">
      <router-link to="/" class="brand"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span><strong>拾光</strong><small>PERSONAL WORKBENCH</small></span></router-link>
      <div class="workspace-label">我的空间 <span>个人</span></div>
      <nav class="primary-nav" aria-label="主要导航"><router-link v-for="item in navigation" :key="item.path" :to="item.path" :class="{ active: route.path === item.path }"><AppIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span><small v-if="item.path === '/tasks' && workspace.dashboard.totalTodo">{{ workspace.dashboard.totalTodo }}</small></router-link></nav>
      <div class="sidebar-divider"></div>
      <button class="quick-create" @click="addTask = true"><AppIcon name="plus" :size="18" /><span>快速添加任务</span></button>
      <div class="sidebar-bottom"><div class="local-card"><span class="local-card-icon"><AppIcon name="lock" :size="17" /></span><div><strong>你的数据，只在本机</strong><p>离线也能安心记录</p></div><span class="status-dot"></span></div><router-link to="/settings" class="settings-nav" :class="{ active: route.path === '/settings' }"><AppIcon name="setting" :size="19" /><span>设置与备份</span></router-link><div class="profile"><span class="avatar">我</span><div><strong>我的工作台</strong><small>留一点时间，给自己</small></div><AppIcon name="sun" :size="19" /></div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb">我的空间 <span>/</span><strong>{{ route.meta.title }}</strong></div><div class="topbar-right"><el-input v-model="search" class="global-search" placeholder="搜索任务、笔记、链接" aria-label="全局搜索" clearable @keydown.enter="doSearch"><template #prefix><AppIcon name="search" :size="17" /></template><template #suffix><kbd>↵</kbd></template></el-input><span class="topbar-divider"></span><span class="online-status"><span class="status-dot"></span>本地模式</span></div></header>
      <main class="page-scroll">
        <div class="page-header"><div><div class="eyebrow">{{ route.path === '/' ? todayLabel : 'MY PERSONAL SPACE' }}</div><h1>{{ route.meta.title }}<span v-if="route.path === '/'" class="title-dot">.</span></h1><p>{{ route.meta.subtitle }}</p></div><el-button v-if="route.path === '/' || route.path === '/tasks'" type="primary" class="primary-add" @click="addTask = true"><AppIcon name="plus" :size="17" />添加任务</el-button></div>
        <div v-if="workspace.error" class="error-banner" role="alert"><AppIcon name="warning" /><span>{{ workspace.error }}</span><el-button text :loading="workspace.loading" @click="workspace.refresh">重新加载</el-button></div>
        <router-view />
        <footer class="page-footer"><span>拾光 · 把日常，慢慢整理好。</span><span><span class="status-dot"></span>本地保存 · {{ workspace.info ? `v${workspace.info.version}` : '正在连接' }}</span></footer>
      </main>
    </div>
    <TaskDialog v-model="addTask" />
    <el-dialog :model-value="editor.leaveDialog" title="还有未保存的笔记" width="460px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false"><p class="dialog-copy">离开前，要保存这次修改吗？</p><template #footer><el-button :disabled="editor.saving" @click="editor.decide('cancel')">取消</el-button><el-button :disabled="editor.saving" @click="editor.decide('discard')">放弃修改</el-button><el-button type="primary" :loading="editor.saving" @click="editor.decide('save')">保存并继续</el-button></template></el-dialog>
  </div>
</template>
