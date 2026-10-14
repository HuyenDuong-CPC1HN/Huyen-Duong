// Ảnh / file đính kèm của tab "Hàng trả & huỷ (Demo)" lưu trên Supabase Storage (bucket ops-files, thư mục
// flowv2/<năm>/<tháng>/). Tên lưu là UUID (tên gốc có dấu / khoảng trắng dễ bị Storage từ chối), tên gốc giữ ở name.
async function repo() {
  const [{ createStorageFilesRepository }, { supabase }] = await Promise.all([import('./storageFiles'), import('../supabase')])
  return createStorageFilesRepository(supabase)
}

export async function uploadFlowFiles(fileList, now = new Date()) {
  const r = await repo()
  const folder = `flowv2/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const out = []
  for (const file of fileList) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    await r.writeFile(path, file)
    out.push({ name: file.name, storagePath: path, type: file.type || '' })
  }
  return out
}

export async function getFlowFileUrl(path) {
  return (await repo()).getSignedUrl(path)
}
