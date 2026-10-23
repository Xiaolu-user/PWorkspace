export interface Weather { temperature: number; low: number; high: number; code: number; isDay: boolean; updatedAt: string }
export function weatherDescription(code: number): { label: string; icon: string } {
  if (code === 0) return { label: '晴', icon: 'sun' }
  if (code <= 2) return { label: '晴间多云', icon: 'cloudSun' }
  if (code === 3) return { label: '多云', icon: 'cloud' }
  if ([45, 48].includes(code)) return { label: '雾', icon: 'cloud' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '雪', icon: 'snow' }
  if (code >= 95) return { label: '雷雨', icon: 'rain' }
  return { label: '雨', icon: 'rain' }
}
