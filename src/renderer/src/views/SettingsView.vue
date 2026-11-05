<script setup lang="ts">
const appIcon = import.meta.env.BASE_URL + 'app-icon.png'
import { ref, watch, onMounted } from 'vue'
import { defaultAppearance, defaultCalendarColors, calendarColorLabels, moduleLabels, type Appearance, type WeatherLocation } from '../../../shared/appearance'
import { ElMessage } from 'element-plus'
import { useWorkspace } from '../stores/workspace'
import { useEditor } from '../stores/editor'
import { unwrap, report, openLink } from '../lib/api'
import type { LoginStartup } from '../../../shared/types'
import AppIcon from '../components/AppIcon.vue'
const workspace = useWorkspace(); const editor = useEditor()
const operation = ref<'backup' | 'restore' | null>(null); const savingPreference = ref(false)
const latestBackup = ref(''); const recoveryBackup = ref('')
const appearance = ref<Appearance>(defaultAppearance()); const savingAppearance = ref(false)
const uploading = ref(false), cityQuery = ref(''), searchingCities = ref(false), cityResults = ref<WeatherLocation[]>([])
const backgroundInput = ref<HTMLInputElement>()
const loginStartup = ref<LoginStartup>({ supported: false, enabled: false })
const loadingStartup = ref(true), savingStartup = ref(false), startupError = ref('')
async function loadStartup(): Promise<void> {
  loadingStartup.value = true; startupError.value = ''
  try { loginStartup.value = unwrap(await window.workbench.app.loginStartup()) }
  catch (error) { startupError.value = '无法读取开机启动设置'; report(error) }
  finally { loadingStartup.value = false }
}
onMounted(loadStartup)
async function setStartup(value: unknown): Promise<void> {
  if (savingStartup.value || typeof value !== 'boolean') return
  savingStartup.value = true
  try { loginStartup.value = unwrap(await window.workbench.app.setLoginStartup(value)); ElMessage.success(value ? '已开启开机自动启动' : '已关闭开机自动启动') }
  catch (error) { report(error); await loadStartup() }
  finally { savingStartup.value = false }
}
async function uploadBackground(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 图片')
    const bitmap = await createImageBitmap(file)
    const ratio = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#eef1f5'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
    const image = canvas.toDataURL('image/jpeg', .88)
    if (image.length > 8_000_000) throw new Error('图片过大，请选择尺寸较小的图片')
    appearance.value.backgroundImage = image
    ElMessage.success('图片已准备好，点击保存外观设置即可应用')
  } catch (error) { report(error) } finally { uploading.value = false; input.value = '' }
}
async function searchCities(): Promise<void> {
  if (searchingCities.value) return
  searchingCities.value = true
  try { cityResults.value = unwrap(await window.workbench.weather.search(cityQuery.value)); if (!cityResults.value.length) ElMessage.info('未找到城市，可尝试城市拼音或英文名') }
  catch (error) { report(error) } finally { searchingCities.value = false }
}
watch(() => workspace.preferences.appearance, value => { appearance.value = JSON.parse(JSON.stringify(value)) }, { immediate: true })
async function saveAppearance(): Promise<void> {
  if (savingAppearance.value) return
  savingAppearance.value = true
  try { workspace.preferences = unwrap(await window.workbench.app.setAppearance(JSON.parse(JSON.stringify(appearance.value)))); ElMessage.success('显示设置已保存并生效') }
  catch (error) { report(error) } finally { savingAppearance.value = false }
}
async function resetAppearance(): Promise<void> { const defaults = defaultAppearance(); Object.assign(appearance.value, { fontScale: defaults.fontScale, dialogScale: defaults.dialogScale, dialogFontScale: defaults.dialogFontScale, courseFontScale: defaults.courseFontScale, modules: defaults.modules }); await saveAppearance() }
async function resetCalendarColors(): Promise<void> { appearance.value.calendarColors = defaultCalendarColors(); await saveAppearance() }
async function setBehavior(value: unknown): Promise<void> {
  if (savingPreference.value) return
  if (value !== 'tray' && value !== 'quit') return
  savingPreference.value = true
  try { workspace.preferences = unwrap(await window.workbench.app.setCloseBehavior(value)); ElMessage.success('设置已保存') }
  catch (error) { report(error) }
  finally { savingPreference.value = false }
}
async function openDirectory(): Promise<void> { try { unwrap(await window.workbench.app.openDataDirectory()) } catch (error) { report(error) } }
async function createBackup(): Promise<void> {
  if (operation.value) return
  operation.value = 'backup'
  try { const result = unwrap(await window.workbench.backup.create()); if (result) { latestBackup.value = result.path; ElMessage.success('备份已保存') } }
  catch (error) { report(error) }
  finally { operation.value = null }
}
async function restoreBackup(): Promise<void> {
  if (operation.value || !await editor.requestLeave()) return
  operation.value = 'restore'
  try {
    const result = unwrap(await window.workbench.backup.restore())
    if (result) { editor.select(null); await workspace.refresh(); recoveryBackup.value = result.safetyBackup || ''; ElMessage.success('备份已恢复，全部内容已刷新') }
  } catch (error) { report(error) }
  finally { operation.value = null }
}
</script>
<template>
  <div class="settings-layout">
    <section id="background" class="panel settings-section background-settings">
      <div class="panel-heading"><h2><AppIcon name="sun" />主题与背景</h2><span class="muted">明亮玻璃 · 自由定制</span></div>
      <div class="background-settings-content">
        <div class="background-preview" :class="{ 'preview-dark': appearance.theme === 'dark' }" :style="{ backgroundColor: appearance.backgroundColor, backgroundImage: appearance.backgroundImage ? `url(${appearance.backgroundImage})` : 'none' }"><div><AppIcon name="clock" :size="22" /><strong>09:41</strong><span>玻璃质感预览</span></div><div><AppIcon name="done" :size="22" /><span>今日待办</span><i></i><i></i></div></div>
        <el-form label-position="top" :disabled="savingAppearance || uploading || !!operation">
          <el-form-item label="显示模式"><el-radio-group v-model="appearance.theme" aria-label="显示模式"><el-radio-button value="light">日间</el-radio-button><el-radio-button value="dark">夜间</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="背景颜色"><div class="background-colors"><input v-model="appearance.backgroundColor" type="color" aria-label="自定义背景颜色" /><button v-for="color in ['#eef1f5', '#f5f2ed', '#e9eeeb', '#e7ebf1', '#eae7ee']" :key="color" type="button" :style="{ backgroundColor: color }" :aria-label="'背景颜色 ' + color" :aria-pressed="appearance.backgroundColor === color" @click="appearance.backgroundColor = color"></button><span>{{ appearance.backgroundColor }}</span></div></el-form-item>
          <el-form-item label="背景图片"><div class="background-image-actions"><el-button :loading="uploading" @click="backgroundInput?.click()"><AppIcon name="upload" :size="17" />上传背景图片</el-button><el-button v-if="appearance.backgroundImage" @click="appearance.backgroundImage = ''">移除图片</el-button></div><input ref="backgroundInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择背景图片" @change="uploadBackground" /><p class="background-hint">支持 JPG、PNG、WebP，最大 20 MB。图片铺满背景；移除后显示所选颜色。图片仅保存于本机，并随数据备份保留。</p></el-form-item>
        </el-form>
      </div>
      <div class="weather-settings"><h3>首页天气</h3><p class="background-hint">选择城市后联网更新天气，每 15 分钟刷新。天气数据来自 Open-Meteo。</p><div class="city-search"><el-input v-model="cityQuery" aria-label="天气城市搜索" placeholder="输入城市，例如：上海" clearable @keydown.enter="searchCities" /><el-button :loading="searchingCities" @click="searchCities">搜索城市</el-button></div><div v-if="cityResults.length" class="city-results"><button v-for="place in cityResults" :key="place.latitude + ',' + place.longitude" @click="appearance.weatherLocation = place; cityResults = []">{{ place.name }}</button></div><p class="selected-city">{{ appearance.weatherLocation ? '已选择：' + appearance.weatherLocation.name : '尚未选择城市' }}<el-button v-if="appearance.weatherLocation" text @click="appearance.weatherLocation = null">清除</el-button></p><button class="text-link" @click="openLink('https://open-meteo.com/')">天气来源：Open-Meteo ↗</button></div>
      <div class="appearance-actions background-actions"><el-button :disabled="savingAppearance || uploading" @click="appearance.backgroundColor = '#eef1f5'; appearance.backgroundImage = ''">恢复默认背景</el-button><el-button type="primary" :loading="savingAppearance" :disabled="uploading || !!operation" @click="saveAppearance">保存外观设置</el-button></div>
    </section>
    <section class="panel settings-section calendar-color-settings"><div class="panel-heading"><h2><AppIcon name="calendar" />日历文字颜色</h2><el-button :disabled="savingAppearance || !!operation" @click="resetCalendarColors">恢复日历默认颜色</el-button></div><p class="appearance-description">分别设置节日、节气、放假、补班等颜色。圆点与右侧详情同步使用对应颜色，保存后生效，重启后保留。</p><div class="calendar-color-controls"><label v-for="(label, key) in calendarColorLabels" :key="key"><span>{{ label }}</span><input v-model="appearance.calendarColors[key]" type="color" :aria-label="label + '颜色'" :disabled="savingAppearance || !!operation" /><code>{{ appearance.calendarColors[key] }}</code></label></div><div class="calendar-color-preview" aria-label="日历颜色预览"><span :style="{ color: appearance.calendarColors.festival }">● 国庆节</span><span :style="{ color: appearance.calendarColors.solarTerm }">● 霜降</span><b :style="{ color: appearance.calendarColors.rest }">休</b><b :style="{ color: appearance.calendarColors.work }">班</b><span :style="{ color: appearance.calendarColors.lunar }">九月十四</span><span :style="{ color: appearance.calendarColors.todo }">2 项待办</span></div><div class="appearance-actions background-actions"><el-button type="primary" :loading="savingAppearance" :disabled="!!operation" @click="saveAppearance">保存日历颜色</el-button></div></section>
    <section class="panel settings-section appearance-settings"><div class="panel-heading"><h2><AppIcon name="setting" />模块与文字大小</h2><el-button :disabled="savingAppearance || !!operation" @click="resetAppearance">恢复默认大小</el-button></div><p class="appearance-description">保存后立即生效，重启仍保留。模块缩放调整整个卡片，文字缩放可单独进一步调整。</p>
      <el-form label-position="top" :disabled="savingAppearance || !!operation" class="appearance-form"><div class="appearance-global"><el-form-item label="全局文字大小（%）"><el-input-number v-model="appearance.fontScale" aria-label="全局文字大小" :min="90" :max="160" :step="5" /></el-form-item><el-form-item label="弹窗大小（%）"><el-input-number v-model="appearance.dialogScale" aria-label="弹窗大小" :min="100" :max="150" :step="5" /></el-form-item><el-form-item label="弹窗文字大小（%）"><el-input-number v-model="appearance.dialogFontScale" aria-label="弹窗文字大小" :min="100" :max="150" :step="5" /></el-form-item></div>
      <div class="appearance-module-row appearance-module-header"><span>首页模块</span><span>模块缩放（%）</span><span>文字缩放（%）</span></div><div v-for="(label, key) in moduleLabels" :key="key" class="appearance-module-row"><strong>{{ label }}</strong><el-input-number v-model="appearance.modules[key].scale" :aria-label="label + '模块大小'" :min="80" :max="140" :step="5" /><el-input-number v-model="appearance.modules[key].fontScale" :aria-label="label + '文字大小'" :min="80" :max="160" :step="5" /></div><div class="appearance-actions"><el-button type="primary" :loading="savingAppearance" @click="saveAppearance">保存显示设置</el-button></div></el-form>
    </section>
    <section class="panel settings-section"><div class="panel-heading"><h2><AppIcon name="monitor" :size="20" />桌面体验</h2></div><div class="setting-row startup-setting"><div><strong id="login-startup-label">开机自动启动</strong><p>{{ startupError || (loadingStartup ? '正在读取系统设置…' : loginStartup.supported ? '开启后，登录 Windows 时自动打开大内总管。' : '安装后的 Windows 版本可启用此功能。') }}</p><button v-if="startupError" class="text-link" @click="loadStartup">重新读取</button></div><el-switch :model-value="loginStartup.enabled" aria-labelledby="login-startup-label" aria-label="开机自动启动" :loading="loadingStartup || savingStartup" :disabled="loadingStartup || savingStartup || !loginStartup.supported || !!startupError || !!operation" @change="setStartup" /></div><div class="setting-row"><div><strong>关闭窗口时</strong><p>你可以让工作台在托盘等待，也可以直接退出。</p></div><el-radio-group :model-value="workspace.preferences.closeBehavior" :disabled="savingPreference || !!operation" @update:model-value="setBehavior"><el-radio-button value="tray">留在托盘</el-radio-button><el-radio-button value="quit">退出软件</el-radio-button></el-radio-group></div><div class="setting-note"><AppIcon name="done" :size="16" /> 真正退出前，会提醒你保存尚未保存的笔记。</div></section>
    <section class="panel settings-section"><div class="panel-heading"><h2><AppIcon name="folder" :size="20" />数据与备份</h2><span class="local-badge"><span class="status-dot"></span>仅保存在本机</span></div>
      <div class="data-path"><span>数据文件夹</span><code>{{ workspace.info?.dataPath || '正在读取…' }}</code><el-button :disabled="!!operation" @click="openDirectory"><AppIcon name="folder" :size="16" />打开文件夹</el-button></div>
      <div class="backup-cards"><article><span class="setting-feature-icon green"><AppIcon name="download" :size="24" /></span><h3>保存一份备份</h3><p>把所有任务、笔记、链接和设置保存为一个文件。你也可以将它放到移动硬盘中。</p><el-button type="primary" :loading="operation === 'backup'" :disabled="!!operation" @click="createBackup">创建备份</el-button></article><article><span class="setting-feature-icon amber"><AppIcon name="upload" :size="24" /></span><h3>从备份中恢复</h3><p>恢复会替换当前内容。工作台会先校验文件，并保留恢复前的数据，以便找回。</p><el-button :loading="operation === 'restore'" :disabled="!!operation" @click="restoreBackup">选择备份并恢复</el-button></article></div>
      <div class="backup-policy"><AppIcon name="lock" :size="18" /><div><strong>每天启动时，自动多一份安心</strong><p>每天首次启动自动备份一次，保留最近 7 份。手动备份和恢复前备份不会自动删除。</p><code>{{ workspace.info?.backupPath }}</code></div></div>
      <div v-if="workspace.info?.startupWarning" class="error-banner" role="alert">{{ workspace.info.startupWarning }}</div>
      <div v-if="latestBackup" class="success-note">最近手动备份：<code>{{ latestBackup }}</code></div>
      <div v-if="recoveryBackup" class="success-note">恢复前的数据已保留：<code>{{ recoveryBackup }}</code></div>
    </section>
    <section class="panel settings-section about-section"><img class="brand-mark brand-image" :src="appIcon" alt="大内总管图标" /><div><h3>大内总管 <span>v{{ workspace.info?.version || '—' }}</span></h3><p>一个安静的个人空间，整理任务，留住想法。</p></div><span class="about-caption">本地运行 · 离线可用</span></section>
  </div>
</template>
