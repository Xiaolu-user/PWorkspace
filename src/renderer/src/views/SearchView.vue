<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { SearchResults } from '../../../shared/types'
import { useWorkspace } from '../stores/workspace'
import { unwrap, formatTime } from '../lib/api'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
const route = useRoute(); const router = useRouter(); const workspace = useWorkspace()
const query = ref(''); const loading = ref(false); const error = ref(''); const limit = ref(20)
const result = ref<SearchResults>({ tasks: [], notes: [], bookmarks: [] })
const total = computed(() => result.value.tasks.length + result.value.notes.length + result.value.bookmarks.length)
const term = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
let sequence = 0
async function load(): Promise<void> {
  query.value = term.value
  const request = ++sequence; loading.value = true; error.value = ''; limit.value = 20
  try { const data = unwrap(await window.workbench.search.query(term.value)); if (request === sequence) result.value = data }
  catch (cause) { if (request === sequence) { error.value = cause instanceof Error ? cause.message : '搜索失败'; result.value = { tasks: [], notes: [], bookmarks: [] } } }
  finally { if (request === sequence) loading.value = false }
}
watch([term, () => workspace.revision], load, { immediate: true })
function search(): void { void router.replace({ path: '/search', query: query.value.trim() ? { q: query.value.trim() } : {} }) }
</script>
<template>
  <section class="panel search-panel"><form class="search-form" @submit.prevent="search"><el-input v-model="query" size="large" maxlength="200" aria-label="搜索全部内容" placeholder="输入关键词，搜索全部内容" clearable><template #prefix><AppIcon name="search" :size="20" /></template></el-input><el-button type="primary" size="large" native-type="submit" :loading="loading">搜索</el-button></form><p class="search-caption">在任务标题与说明、笔记全文、链接名称与网址中查找。</p></section>
  <p v-if="term && !loading && !error" class="results-label">找到 <strong>{{ total }}</strong> 条与“{{ term }}”相关的记录</p>
  <div v-if="error" class="error-banner" role="alert"><AppIcon name="warning" /><span>{{ error }}</span><el-button text @click="load">重试</el-button></div>
  <div v-loading="loading" class="search-results">
    <section v-if="result.tasks.length" class="panel result-group"><div class="panel-heading"><h2><AppIcon name="list" :size="19" />任务 <small>{{ result.tasks.length }}</small></h2></div><button v-for="item in result.tasks.slice(0, limit)" :key="item.id" class="search-result" @click="router.push({ path: '/tasks', query: { id: item.id } })"><span class="result-icon green"><AppIcon name="list" :size="19" /></span><span><strong>{{ item.title }}</strong><p>{{ item.description || (item.status === 'done' ? '已完成' : '未完成') }}</p></span><small>{{ item.dueDate || '无截止日期' }}</small><AppIcon name="right" :size="16" /></button></section>
    <section v-if="result.notes.length" class="panel result-group"><div class="panel-heading"><h2><AppIcon name="document" :size="19" />笔记 <small>{{ result.notes.length }}</small></h2></div><button v-for="item in result.notes.slice(0, limit)" :key="item.id" class="search-result" @click="router.push({ path: '/notes', query: { id: item.id } })"><span class="result-icon amber"><AppIcon name="document" :size="19" /></span><span><strong>{{ item.title }}</strong><p>{{ item.body || '暂无正文' }}</p></span><small>{{ formatTime(item.updatedAt) }}</small><AppIcon name="right" :size="16" /></button></section>
    <section v-if="result.bookmarks.length" class="panel result-group"><div class="panel-heading"><h2><AppIcon name="link" :size="19" />链接 <small>{{ result.bookmarks.length }}</small></h2></div><button v-for="item in result.bookmarks.slice(0, limit)" :key="item.id" class="search-result" @click="router.push({ path: '/bookmarks', query: { id: item.id } })"><span class="result-icon purple"><AppIcon name="link" :size="19" /></span><span><strong>{{ item.title }}</strong><p>{{ item.url }}</p></span><small>{{ item.group }}</small><AppIcon name="right" :size="16" /></button></section>
    <EmptyState v-if="!total && !loading && !error" icon="search" :title="term ? '还没有找到相关内容' : '从一个关键词开始'" :description="term ? '换个词试试，也许它就在另一篇记录里。' : '你的任务、想法和收藏，都能在这里找到。'" />
    <el-button v-if="Math.max(result.tasks.length, result.notes.length, result.bookmarks.length) > limit" class="load-more" @click="limit += 20">显示更多结果</el-button>
  </div>
</template>
