import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import archiver from 'archiver'
import { PassThrough } from 'stream'

// ── Types ──

interface AssetDescriptor {
    nodeId: string
    type: 'image' | 'video'
    bucket: string
    storagePath: string
    originalFilename: string
    role: 'ref' | 'attachment' | 'final_visual' | 'output'
}

interface ExportPackBody {
    mode: 'prompt' | 'column' | 'pack'
    assets: AssetDescriptor[]
    promptPackText?: string
}

// ── Helpers ──

function extFromFilename(filename: string): string {
    const dot = filename.lastIndexOf('.')
    if (dot === -1 || dot === filename.length - 1) return ''
    return filename.substring(dot)
}

function extFromContentType(ct: string | null): string {
    if (!ct) return ''
    const map: Record<string, string> = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
        'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
        'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    }
    return map[ct.split(';')[0].trim().toLowerCase()] ?? ''
}

const ROLE_PRIORITY: Record<string, number> = { final_visual: 0, output: 1, ref: 2, attachment: 3 }

function dedupeAssets(assets: AssetDescriptor[]): AssetDescriptor[] {
    const map = new Map<string, AssetDescriptor>()
    for (const a of assets) {
        const existing = map.get(a.nodeId)
        if (!existing || (ROLE_PRIORITY[a.role] ?? 9) < (ROLE_PRIORITY[existing.role] ?? 9)) {
            map.set(a.nodeId, a)
        }
    }
    return Array.from(map.values())
}

/** Collect output into a single Buffer. Archive must already be piped and finalized. */
function collectPassThrough(pt: PassThrough): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        pt.on('data', (chunk: Buffer) => chunks.push(chunk))
        pt.on('end', () => resolve(Buffer.concat(chunks)))
        pt.on('error', reject)
    })
}

// ── Route ──

export async function POST(req: NextRequest) {
    try {
        // ── 1. Env validation ──
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
        if (!supabaseUrl) {
            console.error('[export-pack] Missing SUPABASE_URL')
            return NextResponse.json({ error: 'Server config error: Missing SUPABASE_URL' }, { status: 500 })
        }
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            console.error('[export-pack] Missing SUPABASE_SERVICE_ROLE_KEY')
            return NextResponse.json({ error: 'Server config error: Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
        }

        // ── 2. Body validation ──
        let body: ExportPackBody
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        if (!body.assets || !Array.isArray(body.assets) || body.assets.length === 0) {
            return NextResponse.json({ error: 'No assets provided', received: typeof body.assets }, { status: 400 })
        }

        const validModes = ['prompt', 'column', 'pack']
        if (!validModes.includes(body.mode)) {
            return NextResponse.json({ error: `Invalid mode: ${body.mode}` }, { status: 400 })
        }

        console.log(`[export-pack] mode=${body.mode} assets=${body.assets.length}`)

        const supabase = createClient(supabaseUrl, serviceKey)

        // Guardrail: exclude output videos (too large for buffered mode)
        const MAX_PACK_BYTES = 50 * 1024 * 1024 // 50 MB
        const assetsFiltered = dedupeAssets(body.assets).filter(a => {
            if (a.role === 'output') {
                console.log(`[export-pack] excluding output video ${a.nodeId} (buffered mode)`)
                return false
            }
            return true
        })

        if (assetsFiltered.length === 0) {
            return NextResponse.json({ error: 'No exportable assets (output videos excluded in buffered mode)' }, { status: 400 })
        }

        const assets = assetsFiltered

        // ── 3. Assign deterministic names ──
        interface ResolvedAsset {
            descriptor: AssetDescriptor
            exportName: string
            zipPath: string
        }

        let refCounter = 0
        const resolved: ResolvedAsset[] = []
        const usedNames = new Set<string>()

        for (const asset of assets) {
            const origExt = extFromFilename(asset.originalFilename)
            let baseName: string
            let ext = origExt

            if (asset.role === 'final_visual') {
                baseName = 'FV'
                if (!ext) ext = asset.type === 'video' ? '.mp4' : '.png'
            } else if (asset.role === 'output') {
                baseName = 'OUTPUT'
                if (!ext) ext = '.mp4'
            } else {
                refCounter++
                baseName = `REF_${String(refCounter).padStart(2, '0')}`
                if (!ext) ext = '.bin'
            }

            let exportName = `${baseName}${ext}`
            if (usedNames.has(exportName)) {
                exportName = `${baseName}_${asset.nodeId.substring(0, 6)}${ext}`
            }
            usedNames.add(exportName)

            const zipPath = (asset.role === 'final_visual' || asset.role === 'output')
                ? exportName
                : `refs/${exportName}`

            resolved.push({ descriptor: asset, exportName, zipPath })
        }

        // ── 4. Build ZIP ──
        const passThrough = new PassThrough()
        const archive = archiver('zip', { zlib: { level: 5 } })
        const downloadErrors: string[] = []

        // Pipe archiver → passThrough BEFORE any appends
        archive.pipe(passThrough)

        // Start collecting chunks immediately (resolves on 'end')
        const zipBufferPromise = collectPassThrough(passThrough)

        // Listen for archiver errors
        archive.on('error', (err) => {
            console.error('[export-pack] archiver error:', err)
            passThrough.destroy(err)
        })

        let totalBytes = 0

        for (const ra of resolved) {
            const { descriptor } = ra
            let buffer: ArrayBuffer | null = null
            let contentType: string | null = null

            // Primary: Supabase Storage download
            if (descriptor.bucket && descriptor.storagePath) {
                console.log(`[export-pack] downloading ${descriptor.bucket}/${descriptor.storagePath}`)
                try {
                    const { data, error } = await supabase.storage
                        .from(descriptor.bucket)
                        .download(descriptor.storagePath)

                    if (!error && data) {
                        contentType = data.type || null
                        buffer = await data.arrayBuffer()
                        console.log(`[export-pack] ✓ ${descriptor.storagePath} (${buffer.byteLength} bytes, ${contentType})`)
                    } else {
                        const msg = `storage download failed: ${descriptor.bucket}/${descriptor.storagePath} — ${error?.message ?? 'unknown'}`
                        console.warn(`[export-pack] ${msg}`)
                        downloadErrors.push(msg)
                    }
                } catch (e) {
                    const msg = `storage download threw: ${descriptor.bucket}/${descriptor.storagePath} — ${e instanceof Error ? e.message : String(e)}`
                    console.warn(`[export-pack] ${msg}`)
                    downloadErrors.push(msg)
                }
            }

            // Fix .bin extension from content-type
            if (buffer && ra.exportName.endsWith('.bin') && contentType) {
                const derived = extFromContentType(contentType)
                if (derived) {
                    ra.exportName = ra.exportName.replace(/\.bin$/, derived)
                    ra.zipPath = ra.zipPath.replace(/\.bin$/, derived)
                }
            }

            if (buffer) {
                totalBytes += buffer.byteLength
                if (totalBytes > MAX_PACK_BYTES) {
                    archive.abort()
                    passThrough.destroy()
                    console.warn(`[export-pack] 413: totalBytes ${totalBytes} exceeds ${MAX_PACK_BYTES}`)
                    return NextResponse.json(
                        { error: 'Pack too large for buffered mode', totalBytes, limit: MAX_PACK_BYTES },
                        { status: 413 },
                    )
                }
                archive.append(Buffer.from(buffer), { name: ra.zipPath })
            } else {
                archive.append(
                    `DOWNLOAD FAILED: ${descriptor.bucket}/${descriptor.storagePath}`,
                    { name: `${ra.zipPath}.MISSING.txt` },
                )
            }
        }

        // prompt.txt — text from PLP already uses REF_01 names, just add upload order header
        if (body.promptPackText) {
            const fileList = resolved.map(ra => ra.exportName)
            const header = [
                'UPLOAD IMAGES IN THIS ORDER:',
                ...fileList,
                '',
                '─'.repeat(40),
                '',
            ].join('\n')
            archive.append(header + body.promptPackText, { name: 'prompt.txt' })
        }

        // ── 5. Finalize archive, then await collected buffer ──
        await archive.finalize()

        const zipBuffer = await zipBufferPromise.catch((err) => {
            console.error('[export-pack] ZIP collect error:', err)
            return null as Buffer | null
        })
        if (!zipBuffer) {
            return NextResponse.json(
                { error: 'ZIP generation failed', downloadErrors },
                { status: 500 },
            )
        }

        console.log(`[export-pack] ✓ ZIP ready: ${zipBuffer.byteLength} bytes`)

        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)

        return new Response(zipBuffer, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="cineboard-${body.mode}-${ts}.zip"`,
                'Content-Length': String(zipBuffer.byteLength),
                'Cache-Control': 'no-store',
            },
        })

    } catch (err) {
        // Top-level catch — nothing escapes without a JSON error
        console.error('[export-pack] unhandled error:', err)
        return NextResponse.json(
            { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        )
    }
}