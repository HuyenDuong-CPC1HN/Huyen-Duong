import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'

const COLLECTION = 'kvstore'

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
    snap.forEach(docSnap => {
      const key = decodeURIComponent(docSnap.id)
      const value = docSnap.data().value
      if (value !== undefined) localStorage.setItem(key, value)
    })
  } catch (err) {
    console.error('Không tải được dữ liệu từ Firebase, dùng dữ liệu cục bộ tạm thời:', err)
  }
}

// Ghi đè localStorage.setItem/removeItem để mọi thay đổi cũng được đẩy lên Firestore (chạy nền, không chặn UI)
export function startCloudSync() {
  if (syncStarted) return
  syncStarted = true

  const originalSetItem = localStorage.setItem.bind(localStorage)
  const originalRemoveItem = localStorage.removeItem.bind(localStorage)

  localStorage.setItem = function (key, value) {
    originalSetItem(key, value)
    setDoc(doc(db, COLLECTION, encodeKey(key)), { value }).catch(err => {
      console.error(`Lỗi đồng bộ "${key}" lên Firebase:`, err)
    })
  }

  localStorage.removeItem = function (key) {
    originalRemoveItem(key)
    deleteDoc(doc(db, COLLECTION, encodeKey(key))).catch(err => {
      console.error(`Lỗi xoá "${key}" trên Firebase:`, err)
    })
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
