import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAuth, getFirestore, initializeApp } = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
}))

vi.mock('firebase/app', () => ({ initializeApp }))
vi.mock('firebase/auth', () => ({ getAuth }))
vi.mock('firebase/firestore', () => ({ getFirestore }))

const environmentConfig = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-auth-domain',
  VITE_FIREBASE_PROJECT_ID: 'test-project-id',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-storage-bucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
  VITE_FIREBASE_APP_ID: 'test-app-id',
}

const configKeys = {
  VITE_FIREBASE_API_KEY: 'apiKey',
  VITE_FIREBASE_AUTH_DOMAIN: 'authDomain',
  VITE_FIREBASE_PROJECT_ID: 'projectId',
  VITE_FIREBASE_STORAGE_BUCKET: 'storageBucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  VITE_FIREBASE_APP_ID: 'appId',
}

describe('Firebase configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    Object.entries(environmentConfig).forEach(([key, value]) => vi.stubEnv(key, value))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('initializes Firebase from Vite environment variables', async () => {
    const initializedApp = { name: 'firebase-app' }
    initializeApp.mockReturnValue(initializedApp)

    await import('./firebase')

    const passedConfig = initializeApp.mock.calls[0][0]
    const usesEnvironmentValues = Object.entries(configKeys).every(
      ([environmentKey, configKey]) => passedConfig[configKey] === environmentConfig[environmentKey],
    )

    expect(usesEnvironmentValues).toBe(true)
    expect(getFirestore).toHaveBeenCalledWith(initializedApp)
    expect(getAuth).toHaveBeenCalledWith(initializedApp)
  })
})
