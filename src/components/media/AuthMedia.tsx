// Authenticated observation media (photos, video, audio). The file endpoint needs the Authorization header, so files are
// fetched as Blobs through TanStack Query (cached by media id) and shown via object URLs revoked on unmount.
import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { useMediaBlob } from '@/api/hooks'
import type { ObservationMedia } from '@/api/types'
import { Icon, IconButton, Modal, Spinner } from '@/components/ui'
import { fmt } from '@/lib/format'

/** Object URL for a Blob, revoked when the Blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => {
      URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [blob])
  return url
}

function unavailableText(error: unknown): string {
  if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return 'Photo unavailable'
  if (error instanceof ApiError && error.status === 403) return 'No access'
  if (error instanceof ApiError && error.status === 0) return 'Offline'
  return 'Photo unavailable'
}

const KIND_ICON: Record<string, string> = { photo: 'image', video: 'movie', audio: 'mic' }

function kindNoun(kind: string) {
  return kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Photo'
}

/** Square thumbnail button. Photos show the image; video shows a play tile. Clicking opens the lightbox. */
export function MediaThumb({ media, size = 72, onOpen, alt }: { media: ObservationMedia; size?: number; onOpen?: () => void; alt: string }) {
  const isPhoto = media.kind === 'photo'
  const q = useMediaBlob(isPhoto ? media : null)
  const url = useObjectUrl(q.data)
  const box = { width: size, height: size }
  const label = `${kindNoun(media.kind)}: ${alt}`

  if (!isPhoto) {
    return (
      <button type="button" onClick={onOpen} aria-label={`Open ${label}`} className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-forest text-cream hover:bg-forest-mid" style={box}>
        <Icon name={media.kind === 'video' ? 'play_circle' : KIND_ICON[media.kind] ?? 'attachment'} size={Math.round(size / 2.6)} />
        <span className="text-[10px] font-semibold">{kindNoun(media.kind)}</span>
      </button>
    )
  }
  if (q.isError) {
    return (
      <div role="img" aria-label={`${label} — ${unavailableText(q.error)}`} title={q.error instanceof Error ? q.error.message : undefined} className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-disabled bg-readonly px-1 text-center text-ink-3" style={box}>
        <Icon name="hide_image" size={Math.round(size / 3.2)} />
        {size >= 56 && <span className="text-[10px] leading-3 font-semibold">{unavailableText(q.error)}</span>}
      </div>
    )
  }
  if (!url) {
    return <div role="status" aria-label={`Loading ${label}`} className="shrink-0 animate-pulse rounded-lg bg-line" style={box} />
  }
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${label}`} className="shrink-0 overflow-hidden rounded-lg bg-line ring-emerald hover:ring-2 focus-visible:ring-2" style={box}>
      <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
    </button>
  )
}

/** Full-size media body (image / video / audio) inside the lightbox. */
function MediaFull({ media, alt }: { media: ObservationMedia; alt: string }) {
  const q = useMediaBlob(media)
  const url = useObjectUrl(q.data)
  if (q.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg bg-readonly text-ink-3">
        <Icon name="hide_image" size={36} />
        <p className="text-small font-semibold">{media.kind === 'photo' ? unavailableText(q.error) : `${kindNoun(media.kind)} unavailable`}</p>
        <p className="max-w-sm text-center text-[12px]">The file could not be loaded from the server. It may not have finished uploading or was removed.</p>
        {!(q.error instanceof ApiError && q.error.status === 404) && (
          <button type="button" className="h-11 rounded-lg px-3 text-small font-semibold text-mid-green hover:bg-black/5" onClick={() => void q.refetch()}>Try again</button>
        )}
      </div>
    )
  }
  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 rounded-lg bg-readonly text-small text-ink-2">
        <Spinner /> Loading {kindNoun(media.kind).toLowerCase()}…
      </div>
    )
  }
  if (media.kind === 'video') return <video src={url} controls className="max-h-[70vh] w-full rounded-lg bg-black" aria-label={alt} />
  if (media.kind === 'audio') return <audio src={url} controls className="w-full" aria-label={alt} />
  return <img src={url} alt={alt} className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain" />
}

/** Inline audio player row (audio has no useful thumbnail). */
export function AudioClip({ media, label }: { media: ObservationMedia; label: string }) {
  const q = useMediaBlob(media)
  const url = useObjectUrl(q.data)
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
      <Icon name="mic" size={18} className="text-mid-green" />
      {q.isError ? (
        <span className="text-small text-ink-3">Audio unavailable</span>
      ) : url ? (
        <audio src={url} controls className="h-9 min-w-0 flex-1" aria-label={label} />
      ) : (
        <span className="flex items-center gap-2 text-small text-ink-3"><Spinner size={14} /> Loading audio</span>
      )}
    </div>
  )
}

/** Lightbox over a list of media with previous/next (arrow keys) and Escape to close. */
export function MediaLightbox({ items, index, onIndex, onClose, title }: { items: ObservationMedia[]; index: number | null; onIndex: (i: number) => void; onClose: () => void; title: string }) {
  const open = index !== null && index >= 0 && index < items.length
  const count = items.length
  const go = useCallback((delta: number) => index !== null && count > 1 && onIndex((index + delta + count) % count), [index, count, onIndex])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, go])
  if (!open) return null
  const m = items[index]!
  const alt = `${title} — ${kindNoun(m.kind).toLowerCase()} ${index + 1} of ${count}`
  return (
    <Modal open onClose={onClose} title={`${title}${count > 1 ? ` · ${index + 1} of ${count}` : ''}`} width={920}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <MediaFull key={m.id} media={m} alt={alt} />
          {count > 1 && (
            <>
              <IconButton icon="chevron_left" label="Previous" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 !rounded-full bg-white/90 shadow-pop hover:!bg-white" />
              <IconButton icon="chevron_right" label="Next" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 !rounded-full bg-white/90 shadow-pop hover:!bg-white" />
            </>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1"><Icon name={KIND_ICON[m.kind] ?? 'attachment'} size={14} />{kindNoun(m.kind)}</span>
          {m.content_type && <span className="mono">{m.content_type}</span>}
          {m.size_bytes != null && <span>{fmt.bytes(m.size_bytes)}</span>}
        </p>
      </div>
    </Modal>
  )
}

/** Thumbnails (photos + video tiles), inline audio players, and a lightbox. */
export function MediaGallery({ media, title, size = 72, max, className }: { media?: ObservationMedia[] | null; title: string; size?: number; max?: number; className?: string }) {
  const [index, setIndex] = useState<number | null>(null)
  const visual = (media ?? []).filter((m) => m.kind !== 'audio')
  const audio = (media ?? []).filter((m) => m.kind === 'audio')
  if (!visual.length && !audio.length) return null
  const shown = max ? visual.slice(0, max) : visual
  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {visual.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${title} media`}>
          {shown.map((m, i) => (
            <li key={m.id}>
              <MediaThumb media={m} size={size} alt={`${title} ${i + 1}`} onOpen={() => setIndex(i)} />
            </li>
          ))}
          {visual.length > shown.length && (
            <li>
              <button type="button" onClick={() => setIndex(shown.length)} className="flex items-center justify-center rounded-lg bg-black/5 text-small font-semibold text-ink-2 hover:bg-black/10" style={{ width: size, height: size }} aria-label={`Show ${visual.length - shown.length} more`}>
                +{visual.length - shown.length}
              </button>
            </li>
          )}
        </ul>
      )}
      {audio.map((m, i) => <AudioClip key={m.id} media={m} label={`${title} audio ${i + 1}`} />)}
      <MediaLightbox items={visual} index={index} onIndex={setIndex} onClose={() => setIndex(null)} title={title} />
    </div>
  )
}
