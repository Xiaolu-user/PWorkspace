import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { emptyFitness, clone, newDay, newSet, type Exercise, type FitnessData, type FitnessItem } from '../../../shared/fitness'
import catalog from './catalog.json'
import { unwrap, report } from '../lib/api'
export const DEFAULT_EXERCISE_IMAGE = 'fitness/cartoon/default-exercise.png'
const presetIds = new Set(catalog.map(e => e.id))
const isCustom = (e: Exercise): boolean => !e.sourceName && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(e.id)
export function withExerciseImage(e: Exercise): Exercise {
  const image = e.image || DEFAULT_EXERCISE_IMAGE
  return { ...e, image, images: e.image && e.images.length ? e.images : [image], artworkStatus: 'ready' }
}
export const useFitness = defineStore('fitness', () => {
  const data = ref<FitnessData>(emptyFitness()), loaded = ref(false)
  const exercises = computed(() => {
    const edits = new Map(data.value.exercises.map(e => [e.id, e]))
    return [
      ...(catalog as Exercise[]).map(base => {
        const edit = edits.get(base.id)
        if (!edit) return withExerciseImage(base)
        const image = edit.image.startsWith('data:') ? edit.image : base.image
        return withExerciseImage({ ...base, ...edit, sourceName: base.sourceName, image, images: [image] })
      }),
      ...data.value.exercises.filter(isCustom).map(withExerciseImage)
    ]
  })
  const availableExercises = exercises
  const exercise = (id: string): Exercise | undefined => exercises.value.find(e => e.id === id)
  function item(id: string): FitnessItem { return { exerciseId: id, sets: Array.from({ length: 3 }, () => newSet()), rest: 60, notes: '' } }
  async function save(message = ''): Promise<boolean> { try { unwrap(await window.workbench.fitness.save(clone(data.value))); if (message) ElMessage.success(message); return true } catch (e) { report(e); return false } }
  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      data.value = unwrap(await window.workbench.fitness.get())
      const before = JSON.stringify(data.value.exercises)
      const updateCatalog = data.value.catalogVersion !== 1
      data.value.exercises = data.value.exercises.filter(e => presetIds.has(e.id) || isCustom(e)).map(e => {
        const base = (catalog as Exercise[]).find(b => b.id === e.id)
        const updated = base && updateCatalog ? { ...e, name: base.name, sourceName: base.sourceName, image: e.image.startsWith('data:') ? e.image : base.image, images: e.image.startsWith('data:') ? [e.image] : base.images, description: base.description, muscles: base.muscles, secondary: base.secondary } : e
        return withExerciseImage(updated)
      })
      data.value.catalogVersion = 1
      if (updateCatalog || before !== JSON.stringify(data.value.exercises)) await save()
      if (!data.value.templateSeeded) {
        data.value.templateSeeded = true
        const defs = [ ['推 · 胸肩三头', '推', ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise', 'Triceps_Pushdown']], ['拉 · 背部二头', '拉', ['Wide-Grip_Lat_Pulldown', 'Seated_Cable_Rows', 'One-Arm_Dumbbell_Row', 'Dumbbell_Bicep_Curl']], ['腿 · 下肢核心', '腿', ['Barbell_Squat', 'Romanian_Deadlift', 'Leg_Press', 'Lying_Leg_Curls', 'Standing_Calf_Raises']] ]
        data.value.templates = defs.map(([title, type, ids]) => ({ ...newDay(title as string, type as string), id: crypto.randomUUID(), items: (ids as string[]).filter(id => exercise(id)).map(id => item(id)) }))
        for (const day of data.value.rhythm) { const t = data.value.templates.find(t => t.type === day.type); if (t && !day.items.length) { day.items = clone(t.items); day.templateId = t.id } }
        await save()
      }
      loaded.value = true
    } catch (e) { report(e) }
  }
  function editExercise(e: Exercise): void { const value = withExerciseImage(clone(e)); const n = data.value.exercises.findIndex(x => x.id === e.id); if (n < 0) data.value.exercises.push(value); else data.value.exercises[n] = value }
  return { data, loaded, exercises, availableExercises, exercise, item, load, save, editExercise }
})
export const asset = (path: string): string => path.startsWith('data:') ? path : new URL(import.meta.env.BASE_URL + path, location.href).href
export const tone = (type: string): string => ({ 推: 'mint', 拉: 'lavender', 腿: 'peach', 休息: 'blue' }[type] || 'mint')
