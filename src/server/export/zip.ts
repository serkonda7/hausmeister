// Streaming ZIP writer (PKWARE APPNOTE 6.3) with ZIP64, for exports larger than
// 4 GiB (fflate's Zip has no ZIP64). Entries are written one after another:
// local header, data, data descriptor (CRC and sizes follow the data, so
// nothing is buffered). Only the central directory (~100 bytes per entry) is
// kept in memory until finish().
//  - method 0 (stored) for files that are already compressed (photos, PDFs),
//    method 8 (deflate, via fflate's streaming Deflate) for JSON/CSV/text.
//  - names are UTF-8 (flag bit 11), times are Europe/Berlin DOS times plus a
//    UTC "extended timestamp" extra field.
//  - an entry gets a ZIP64 local header when its known size is >= 4 GiB (or
//    when forced); the central directory and end record switch to ZIP64 as
//    soon as an offset, size or the entry count overflows.
import { crc32 } from 'node:zlib'
import { Deflate } from 'fflate'

const MAX32 = 0xffffffff
const MAX16 = 0xffff
const FLAG_DESCRIPTOR = 1 << 3
const FLAG_UTF8 = 1 << 11
const VERSION_ZIP64 = 45
const VERSION_DEFAULT = 20
/** "made by": 3 = Unix (so the external attributes carry a file mode), spec 4.5. */
const MADE_BY = (3 << 8) | VERSION_ZIP64

export type ZipOut = (chunk: Uint8Array) => Promise<void>

type CentralRecord = {
	name: Uint8Array
	method: 0 | 8
	flags: number
	crc: number
	compressed: number
	size: number
	offset: number
	localZip64: boolean
}

export type EntryResult = { size: number; compressed: number; crc: number }

const enc = new TextEncoder()

function dosDateTime(date: Date): { time: number; day: number } {
	// DOS times have no zone; use the household's (DESIGN §0: Europe/Berlin).
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Europe/Berlin',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		})
			.formatToParts(date)
			.map((p) => [p.type, Number(p.value)]),
	) as Record<string, number>
	const year = Math.max(1980, parts.year ?? 1980)
	return {
		time:
			((parts.hour ?? 0) << 11) |
			((parts.minute ?? 0) << 5) |
			Math.floor((parts.second ?? 0) / 2),
		day: ((year - 1980) << 9) | ((parts.month ?? 1) << 5) | (parts.day ?? 1),
	}
}

class Bytes {
	readonly buf: Uint8Array
	private view: DataView
	private pos = 0
	constructor(size: number) {
		this.buf = new Uint8Array(size)
		this.view = new DataView(this.buf.buffer)
	}
	u16(v: number) {
		this.view.setUint16(this.pos, v, true)
		this.pos += 2
		return this
	}
	u32(v: number) {
		this.view.setUint32(this.pos, v >>> 0, true)
		this.pos += 4
		return this
	}
	u64(v: number) {
		this.view.setBigUint64(this.pos, BigInt(v), true)
		this.pos += 8
		return this
	}
	bytes(b: Uint8Array) {
		this.buf.set(b, this.pos)
		this.pos += b.length
		return this
	}
}

export type ZipEntry = {
	/** Appends bytes to the entry (CRC and sizes are tracked). */
	write(data: Uint8Array): Promise<void>
	/** Ends the entry: flushes the compressor, writes the data descriptor. */
	close(): Promise<EntryResult>
}

export class ZipWriter {
	private offset = 0
	private readonly central: CentralRecord[] = []
	private readonly time: number
	private readonly day: number
	private readonly unixTime: number
	private open = false
	private finished = false

	constructor(
		private readonly out: ZipOut,
		private readonly opts: { date?: Date; forceZip64?: boolean } = {},
	) {
		const date = opts.date ?? new Date()
		const dt = dosDateTime(date)
		this.time = dt.time
		this.day = dt.day
		this.unixTime = Math.floor(date.getTime() / 1000)
	}

	/** Bytes written so far. */
	get bytesWritten() {
		return this.offset
	}

	get entryCount() {
		return this.central.length
	}

	private async emit(chunk: Uint8Array) {
		if (chunk.length === 0) return
		this.offset += chunk.length
		await this.out(chunk)
	}

	private extTimestamp(): Uint8Array {
		return new Bytes(9)
			.u16(0x5455)
			.u16(5)
			.bytes(new Uint8Array([1]))
			.u32(this.unixTime).buf
	}

	/**
	 * Starts an entry. Only one entry can be open at a time. `size` is the
	 * uncompressed size when known up front (files); it only decides whether the
	 * local header needs ZIP64.
	 */
	async begin(path: string, opts: { compress: boolean; size?: number }): Promise<ZipEntry> {
		if (this.open) throw new Error('zip: previous entry still open')
		if (this.finished) throw new Error('zip: already finished')
		if (!path || path.startsWith('/') || path.split('/').includes('..'))
			throw new Error(`zip: invalid entry name ${path}`)
		this.open = true
		const name = enc.encode(path)
		if (name.length > MAX16) throw new Error('zip: entry name too long')
		const method: 0 | 8 = opts.compress ? 8 : 0
		const flags = FLAG_DESCRIPTOR | FLAG_UTF8
		const localZip64 = !!this.opts.forceZip64 || (opts.size ?? 0) >= MAX32
		const ts = this.extTimestamp()
		const zip64Extra = localZip64 ? new Bytes(20).u16(0x0001).u16(16).u64(0).u64(0).buf : null
		const extraLen = ts.length + (zip64Extra?.length ?? 0)
		const header = new Bytes(30 + name.length + extraLen)
			.u32(0x04034b50)
			.u16(localZip64 ? VERSION_ZIP64 : VERSION_DEFAULT)
			.u16(flags)
			.u16(method)
			.u16(this.time)
			.u16(this.day)
			.u32(0) // crc: in the data descriptor
			.u32(localZip64 ? MAX32 : 0)
			.u32(localZip64 ? MAX32 : 0)
			.u16(name.length)
			.u16(extraLen)
			.bytes(name)
			.bytes(ts)
		if (zip64Extra) header.bytes(zip64Extra)
		const offset = this.offset
		await this.emit(header.buf)

		let crc = 0
		let size = 0
		let compressed = 0
		let pending: Uint8Array[] = []
		const deflate = method === 8 ? new Deflate({ level: 6 }) : null
		if (deflate) deflate.ondata = (chunk) => pending.push(chunk)
		const drain = async () => {
			const list = pending
			pending = []
			for (const c of list) {
				compressed += c.length
				await this.emit(c)
			}
		}

		return {
			write: async (data: Uint8Array) => {
				if (data.length === 0) return
				crc = crc32(data, crc)
				size += data.length
				if (deflate) {
					deflate.push(data, false)
					await drain()
				} else {
					compressed += data.length
					await this.emit(data)
				}
			},
			close: async () => {
				if (deflate) {
					deflate.push(new Uint8Array(0), true)
					await drain()
				}
				if (!localZip64 && (size >= MAX32 || compressed >= MAX32))
					throw new Error(`zip: ${path} exceeds 4 GiB without a ZIP64 header`)
				const desc = localZip64
					? new Bytes(24).u32(0x08074b50).u32(crc).u64(compressed).u64(size)
					: new Bytes(16).u32(0x08074b50).u32(crc).u32(compressed).u32(size)
				await this.emit(desc.buf)
				this.central.push({
					name,
					method,
					flags,
					crc,
					compressed,
					size,
					offset,
					localZip64,
				})
				this.open = false
				return { size, compressed, crc }
			},
		}
	}

	/** Writes a whole entry from an (async) iterable of chunks. */
	async add(
		path: string,
		source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
		opts: { compress: boolean; size?: number },
	): Promise<EntryResult> {
		const e = await this.begin(path, opts)
		for await (const chunk of source) await e.write(chunk)
		return e.close()
	}

	/** Writes the central directory and the end records. */
	async finish(): Promise<{ bytes: number; entries: number }> {
		if (this.open) throw new Error('zip: entry still open')
		this.finished = true
		const cdStart = this.offset
		const force = !!this.opts.forceZip64
		for (const r of this.central) {
			const bigSize = force || r.size >= MAX32
			const bigComp = force || r.compressed >= MAX32
			const bigOff = force || r.offset >= MAX32
			const z64Len = (bigSize ? 8 : 0) + (bigComp ? 8 : 0) + (bigOff ? 8 : 0)
			const ts = this.extTimestamp()
			const extraLen = ts.length + (z64Len ? 4 + z64Len : 0)
			const rec = new Bytes(46 + r.name.length + extraLen)
				.u32(0x02014b50)
				.u16(MADE_BY)
				.u16(r.localZip64 || z64Len ? VERSION_ZIP64 : VERSION_DEFAULT)
				.u16(r.flags)
				.u16(r.method)
				.u16(this.time)
				.u16(this.day)
				.u32(r.crc)
				.u32(bigComp ? MAX32 : r.compressed)
				.u32(bigSize ? MAX32 : r.size)
				.u16(r.name.length)
				.u16(extraLen)
				.u16(0) // comment
				.u16(0) // disk
				.u16(0) // internal attributes
				.u32((0o100644 << 16) >>> 0) // regular file, rw-r--r--
				.u32(bigOff ? MAX32 : r.offset)
				.bytes(r.name)
				.bytes(ts)
			if (z64Len) {
				rec.u16(0x0001).u16(z64Len)
				if (bigSize) rec.u64(r.size)
				if (bigComp) rec.u64(r.compressed)
				if (bigOff) rec.u64(r.offset)
			}
			await this.emit(rec.buf)
		}
		const cdSize = this.offset - cdStart
		const n = this.central.length
		const needZip64 = force || n >= MAX16 || cdStart >= MAX32 || cdSize >= MAX32
		if (needZip64) {
			const eocd64At = this.offset
			await this.emit(
				new Bytes(56)
					.u32(0x06064b50)
					.u64(44)
					.u16(MADE_BY)
					.u16(VERSION_ZIP64)
					.u32(0)
					.u32(0)
					.u64(n)
					.u64(n)
					.u64(cdSize)
					.u64(cdStart).buf,
			)
			await this.emit(new Bytes(20).u32(0x07064b50).u32(0).u64(eocd64At).u32(1).buf)
		}
		await this.emit(
			new Bytes(22)
				.u32(0x06054b50)
				.u16(0)
				.u16(0)
				.u16(needZip64 ? MAX16 : n)
				.u16(needZip64 ? MAX16 : n)
				.u32(needZip64 ? MAX32 : cdSize)
				.u32(needZip64 ? MAX32 : cdStart)
				.u16(0).buf,
		)
		return { bytes: this.offset, entries: n }
	}
}
