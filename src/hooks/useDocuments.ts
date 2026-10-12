import { useCallback, useEffect, useState } from 'react'
import { readDocuments, saveDocuments, type ApplicationDocument } from '../lib/documents'

export function useDocuments() {
  const [documents, setDocuments] = useState<ApplicationDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try { setDocuments(await readDocuments()); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : '無法讀取文件庫。') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const save = useCallback(async (items: ApplicationDocument[]) => {
    await saveDocuments(items)
    // Refresh only after the transaction commits, so quota errors never look like a successful save.
    await refresh()
  }, [refresh])
  return { documents, loading, error, save, refresh }
}
export type DocumentsController = ReturnType<typeof useDocuments>
