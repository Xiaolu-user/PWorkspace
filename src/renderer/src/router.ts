import { createRouter, createWebHashHistory } from 'vue-router'
import { useEditor } from './stores/editor'
import DashboardView from './views/DashboardView.vue'

export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', name: 'dashboard', component: DashboardView, meta: { title: '今日概览', subtitle: '把时间，留给重要的事。' } },
  { path: '/tasks', name: 'tasks', component: () => import('./views/TasksView.vue'), meta: { title: '我的待办', subtitle: '清空脑海，一次专注一件事。' } },
  { path: '/courses', name: 'courses', component: () => import('./views/CoursesView.vue'), meta: { title: '课程表', subtitle: '整周与整学期课程。' } },
  { path: '/fitness', name: 'fitness', component: () => import('./views/FitnessView.vue'), meta: { title: '健身计划' } },
  { path: '/notes', name: 'notes', component: () => import('./views/NotesView.vue'), meta: { title: '随手笔记', subtitle: '让灵感有处安放。' } },
  { path: '/bookmarks', name: 'bookmarks', component: () => import('./views/BookmarksView.vue'), meta: { title: '常用链接', subtitle: '常去的地方，一步抵达。' } },
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { title: '搜索工作台', subtitle: '找回一条记录，也找回一个想法。' } },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: '设置与备份', subtitle: '让你的记录，安心留在这里。' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
] })
router.beforeEach(async (to, from) => {
  if ((from.path === '/notes' && to.fullPath !== from.fullPath) || (from.path === '/' && to.path !== '/')) return useEditor().requestLeave()
  return true
})
