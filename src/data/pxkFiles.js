// Ảnh / PDF Phiếu xuất kho nhà máy (mục Đối chiếu sổ sách) lưu trên Supabase Storage (bucket ops-files, thư mục
// pxk/<năm>/<tháng>/). Ảnh tải lên nguyên gốc, không nén. Tên lưu là UUID, tên gốc giữ ở name.
async function repo() {
  const [{ createStorageFilesRepository }, { supabase }] = await Promise.all([import('./storageFiles'), import('../supabase')])
  return createStorageFilesRepository(supabase)
}

export async function uploadPxkFile(file, now = new Date()) {
  const r = await repo()
  const folder = `pxk/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  await r.writeFile(path, file)
  return { name: file.name, storagePath: path, type: file.type || '', size: file.size || 0 }
}

export async function getPxkFileUrl(path) {
  return (await repo()).getSignedUrl(path)
}

export async function downloadPxkFile(path) {
  return (await repo()).downloadFile(path)
}
