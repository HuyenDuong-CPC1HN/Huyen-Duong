import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'

const COLLECTION = 'kvstore'

// Firestore giới hạn mỗi document tối đa ~1MB — dữ liệu tuần Excel/carrier có thể vượt giới hạn này,
// nên phải cắt nhỏ thành nhiều document con ("chunk") khi cần.
const CHUNK_SIZE = 700000 // ký tự — chừa dư so với giới hạn thật (1.048.487 byte) vì ký tự tiếng Việt UTF-8 có thể tới 3 byte
const CHUNK_DELETE_SCAN = 40 // số chunk tối đa sẽ dọn dẹp khi ghi đè bằng bản nhỏ hơn/xoá key (dư sức cho dữ liệu thực tế)

// Firestore không cho phép ký tự "/" trong document ID — mã hoá an toàn
function encodeKey(key) {
  return encodeURIComponent(key)
}

let syncStarted = false
let hydrated = false

// Tải toàn bộ dữ liệu từ Firestore ghi đè vào localStorage — gọi 1 lần sau khi đăng nhập, trước khi render app
export async function hydrateLocalStorageFromCloud() {
  if (hydrated) return
  hydrated = true
  try {
    const snap = await getDocs(collection(db, COLLECTION))
    const docsById = new Map()
    snap.forEach(docSnap => docsById.set(docSnap.id, docSnap.data()))

    for (const [id, data] of docsById) {
      if (id.includes('__chunk')) continue // được ráp lại thông qua document gốc (chunked: true) bên dưới
      const key = decodeURIComponent(id)
      if (data.chunked) {
        let full = ''
        for (let i = 0; i < data.chunkCount; i++) {
          const part = docsById.get(`${id}__chunk${i}`)
          if (part?.value !== undefined) full += part.value
        }
        localStorage.setItem(key, full)
      } else if (data.value !== undefined) {
        localStorage.setItem(key, data.value)
      }
    }
  } catch (err) {
    console.error('Không tải được dữ liệu từ Firebase, dùng dữ liệu cục bộ tạm thời:', err)
  }
}

// Xoá tối đa CHUNK_DELETE_SCAN document con của 1 key (dùng khi ghi đè bằng bản nhỏ hơn hoặc xoá hẳn key).
// Xoá document không tồn tại trên Firestore không báo lỗi nên có thể "quét xoá" thoải mái.
function deleteLeftoverChunks(encodedKeyId, fromIndex) {
  for (let i = fromIndex; i < CHUNK_DELETE_SCAN; i++) {
    deleteDoc(doc(db, COLLECTION, `${encodedKeyId}__chunk${i}`)).catch(() => { /* ignore */ })
  }
}

// Ghi 1 key/value lên Firestore — tự động cắt nhỏ thành nhiều document nếu value vượt giới hạn 1 document
async function writeKeyToCloud(key, value) {
  const id = encodeKey(key)
  const docRef = doc(db, COLLECTION, id)

  if (value.length <= CHUNK_SIZE) {
    await setDoc(docRef, { value })
    deleteLeftoverChunks(id, 0)
    return
  }

  const chunkCount = Math.ceil(value.length / CHUNK_SIZE)
  const writes = []
  for (let i = 0; i < chunkCount; i++) {
    const chunkValue = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    writes.push(setDoc(doc(db, COLLECTION, `${id}__chunk${i}`), { value: chunkValue }))
  }
  writes.push(setDoc(docRef, { chunked: true, chunkCount }))
  await Promise.all(writes)
  deleteLeftoverChunks(id, chunkCount)
}

// Ghi đè localStorage.setItem/removeItem để mọi thay đổi cũng được đẩy lên Firestore (chạy nền, không chặn UI)
export function startCloudSync() {
  if (syncStarted) return
  syncStarted = true

  const originalSetItem = localStorage.setItem.bind(localStorage)
  const originalRemoveItem = localStorage.removeItem.bind(localStorage)

  localStorage.setItem = function (key, value) {
    originalSetItem(key, value)
    writeKeyToCloud(key, String(value)).catch(err => {
      console.error(`Lỗi đồng bộ "${key}" lên Firebase:`, err)
    })
  }

  localStorage.removeItem = function (key) {
    originalRemoveItem(key)
    deleteDoc(doc(db, COLLECTION, encodeKey(key))).catch(err => {
      console.error(`Lỗi xoá "${key}" trên Firebase:`, err)
    })
    deleteLeftoverChunks(encodeKey(key), 0)
  }
}

// Đẩy TOÀN BỘ dữ liệu đang có trong localStorage lên Firestore — dùng 1 lần trên máy đã có sẵn dữ liệu cũ
// (phải gọi sau startCloudSync() để mỗi lần setItem cũng tự đẩy lên cloud)
export async function pushAllLocalStorageToCloud() {
  const keys = Object.keys(localStorage)
  let count = 0
  for (const key of keys) {
    const value = localStorage.getItem(key)
    if (value === null) continue
    localStorage.setItem(key, value) // đi qua bản setItem đã patch để đồng thời ghi lên Firestore
    count++
  }
  return count
}
