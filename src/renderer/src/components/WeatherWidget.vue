<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { unwrap } from '../lib/api'
import { weatherDescription, type Weather } from '../../../shared/weather'
import AppIcon from './AppIcon.vue'
const ws = useWorkspace()
const weather = ref<Weather | null>(null), error = ref(''), loading = ref(false)
let version = 0, timer: ReturnType<typeof setInterval>
const description = computed(() => weather.value ? weatherDescription(weather.value.code) : null)
async function refresh(): Promise<void> {
  const request = ++version
  if (!ws.preferences.appearance.weatherLocation) { weather.value = null; error.value = ''; loading.value = false; return }
  loading.value = true
  try { const value = unwrap(await window.workbench.weather.current()); if (request === version) { weather.value = value; error.value = '' } }
  catch (e) { if (request === version) error.value = e instanceof Error ? e.message : '天气暂不可用' }
  finally { if (request === version) loading.value = false }
}
watch(() => JSON.stringify(ws.preferences.appearance.weatherLocation), () => { weather.value = null; void refresh() }, { immediate: true })
onMounted(() => { timer = setInterval(() => void refresh(), 15 * 60_000) })
onBeforeUnmount(() => { version++; clearInterval(timer) })
</script>
<template>
  <div class="weather-widget" aria-label="天气">
    <template v-if="weather">
      <AppIcon :name="!weather.isDay && weather.code <= 2 ? 'moon' : description!.icon" :size="44" />
      <strong class="weather-temperature">{{ weather.temperature }}°</strong><span>{{ description?.label }}</span>
      <small>{{ weather.low }}° – {{ weather.high }}°</small>
      <router-link to="/settings#background" :title="ws.preferences.appearance.weatherLocation?.name">{{ ws.preferences.appearance.weatherLocation?.name.split(' · ')[0] }}</router-link>
      <small v-if="error" title="显示的是上次获取的数据">更新失败 · 上次数据</small>
      <small v-else :title="new Date(weather.updatedAt).toLocaleString('zh-CN')">{{ new Date(weather.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }} 更新</small>
    </template>
    <template v-else><AppIcon name="cloudSun" :size="38" /><span>{{ loading ? '获取天气中' : error ? '天气暂不可用' : '今日天气' }}</span><button v-if="error" class="text-link" :title="error" @click="refresh">重新获取</button><router-link v-else-if="!loading" to="/settings#background">选择城市 →</router-link></template>
  </div>
</template>
