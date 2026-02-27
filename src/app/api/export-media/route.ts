import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_BUCKETS = new Set(['take-images', 'take-videos'])

/** GET /api/export-media?bucket=...&storagePath=...&filename=...
 *  Downloads original binary from Supabase Storage and returns with Content-Disposition. */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket')
    const storagePath = searchParams.get('storagePath')
    const filename = searchParams.get('filename') || 'download'

    if (!bucket || !storagePath) {
        return NextResponse.json({ error: 'Missing bucket or storagePath' }, { status: 400 })
    }

    if (!ALLOWED_BUCKETS.has(bucket)) {
        return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
    }

    // Basic path traversal guard
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid storagePath' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    try {
        const { data, error } = await supabase.storage
            .from(bucket)
            .download(storagePath)

        if (error || !data) {
            console.warn(`[export-media] download failed: ${bucket}/${storagePath} — ${error?.message ?? 'no data'}`)
            return NextResponse.json({ error: 'File not found' }, { status: 404 })
        }

        const buffer = await data.arrayBuffer()
        const contentType = data.type || 'application/octet-stream'

        // Sanitize filename for Content-Disposition
        const safeName = filename
            .replace(/[^a-zA-Z0-9._\-() ]/g, '_')
            .substring(0, 120)
            || 'download'

        return new Response(buffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${safeName}"`,
                'Content-Length': String(buffer.byteLength),
                'Cache-Control': 'private, max-age=3600',
            },
        })
    } catch (err) {
        console.error('[export-media] error:', err)
        return NextResponse.json(
            { error: 'Download failed' },
            { status: 500 },
        )
    }
}