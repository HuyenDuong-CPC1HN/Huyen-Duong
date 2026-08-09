import { createClient } from '@supabase/supabase-js'

const requiredEnv = [
  ['VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL],
  ['VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY],
]

export const supabaseMissingEnv = requiredEnv
  .filter(([, value]) => !String(value ?? '').trim())
  .map(([name]) => name)
export const supabaseConfigReady = supabaseMissingEnv.length === 0

export const supabase = supabaseConfigReady
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null

export async function assertCloudAvailable(client = supabase) {
  if (!navigator.onLine) throw new Error('Bạn đang ngoại tuyến. Ứng dụng chỉ hoạt động khi có Internet.')
  const { error } = await client.auth.getSession()
  if (error) throw new Error('Không thể kết nối Supabase. Vui lòng kiểm tra Internet rồi thử lại.')
}
