const BUCKET = 'ops-files'

function fail(error, action) {
  if (error) throw new Error(`${action}: ${error.message || error}`)
}

export function createStorageFilesRepository(client) {
  const files = client.storage.from(BUCKET)
  return {
    async writeJson(path, value) {
      const body = new Blob([JSON.stringify(value)], { type: 'application/json' })
      const { error } = await files.upload(path, body, { upsert: true, contentType: 'application/json' })
      fail(error, 'Không thể lưu dữ liệu vào kho tệp')
      return path
    },
    async readJson(path) {
      const { data, error } = await files.download(path)
      if (error || !data) throw new Error(`Không tải được dữ liệu tuần từ kho tệp: ${error?.message || 'không tìm thấy tệp'}`)
      try {
        return JSON.parse(await data.text())
      } catch {
        throw new Error('Dữ liệu trong kho tệp không hợp lệ. Vui lòng liên hệ quản trị viên.')
      }
    },
    async remove(path) {
      const { error } = await files.remove([path])
      fail(error, 'Không thể xóa dữ liệu trong kho tệp')
    },
    // Lưu file gốc (PDF/ảnh...) thay vì JSON — dùng cho các bản scan đính kèm như biên bản giao nhận.
    async writeFile(path, file) {
      const { error } = await files.upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
      fail(error, 'Không thể tải tệp lên kho tệp')
      return path
    },
    async getSignedUrl(path, expiresIn = 3600) {
      const { data, error } = await files.createSignedUrl(path, expiresIn)
      fail(error, 'Không tạo được liên kết xem tệp')
      return data.signedUrl
    },
  }
}
