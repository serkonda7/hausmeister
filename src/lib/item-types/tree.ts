// Type inheritance (DESIGN §4.2): a child type inherits its ancestors' fields
// and adds its own. Pure helpers over a flat list of type rows, usable on the
// client (live preview) and the server.
//
// Rules enforced by validateTypeTree:
//  - no parent cycles (a type can't be its own ancestor);
//  - a field key is unique along every ancestor chain: a child may not declare a
//    key that any ancestor declares, hidden ones included (hidden values are
//    still stored under that key). No overriding.
import type { FieldDefinition } from './fields'

export type TypeNodeLike = {
	id: string
	parentId: string | null
	fields: readonly FieldDefinition[]
}

export type EffectiveField = FieldDefinition & {
	/** The type that declares the field. */
	sourceTypeId: string
	/** True when declared by an ancestor, not by the type itself. */
	inherited: boolean
}

const byId = <T extends TypeNodeLike>(types: readonly T[]) => new Map(types.map((t) => [t.id, t]))

/**
 * Ancestors from the root down to the direct parent (excluding `typeId`).
 * Stops at missing parents and at cycles instead of looping forever.
 */
export function ancestorIds(types: readonly TypeNodeLike[], typeId: string): string[] {
	const map = byId(types)
	const chain: string[] = []
	const seen = new Set([typeId])
	let cur = map.get(typeId)?.parentId ?? null
	while (cur && !seen.has(cur) && map.has(cur)) {
		chain.unshift(cur)
		seen.add(cur)
		cur = map.get(cur)?.parentId ?? null
	}
	return chain
}

/** All fields of a type, ancestors' first (root first), then its own; hidden ones included. */
export function resolveFields(types: readonly TypeNodeLike[], typeId: string): EffectiveField[] {
	const map = byId(types)
	const out: EffectiveField[] = []
	for (const id of [...ancestorIds(types, typeId), typeId]) {
		const t = map.get(id)
		if (!t) continue
		for (const f of t.fields) out.push({ ...f, sourceTypeId: id, inherited: id !== typeId })
	}
	return out
}

/** `typeId` plus every descendant id (item filters by "Tool" include subtypes). */
export function typeAndDescendantIds(types: readonly TypeNodeLike[], typeId: string): string[] {
	const children = new Map<string, string[]>()
	for (const t of types) {
		if (!t.parentId) continue
		const list = children.get(t.parentId) ?? []
		list.push(t.id)
		children.set(t.parentId, list)
	}
	const out: string[] = []
	const seen = new Set<string>()
	const stack = [typeId]
	while (stack.length) {
		const id = stack.pop()!
		if (seen.has(id)) continue
		seen.add(id)
		out.push(id)
		stack.push(...(children.get(id) ?? []))
	}
	return out
}

/** True if making `parentId` the parent of `typeId` would create a cycle. */
export function wouldCreateCycle(
	types: readonly TypeNodeLike[],
	typeId: string,
	parentId: string | null,
): boolean {
	if (!parentId) return false
	return typeAndDescendantIds(types, typeId).includes(parentId)
}

export type TreeProblem =
	| { code: 'cycle'; typeId: string }
	| { code: 'key_collision'; typeId: string; key: string; ancestorId: string }

/** Checks the whole forest for cycles and inherited key collisions. */
export function validateTypeTree(types: readonly TypeNodeLike[]): TreeProblem[] {
	const map = byId(types)
	const problems: TreeProblem[] = []
	for (const t of types) {
		// cycle: walking up from t reaches t again
		const seen = new Set<string>()
		let cur: string | null = t.parentId
		let cyclic = false
		while (cur) {
			if (cur === t.id) {
				cyclic = true
				break
			}
			if (seen.has(cur)) break
			seen.add(cur)
			cur = map.get(cur)?.parentId ?? null
		}
		if (cyclic) {
			problems.push({ code: 'cycle', typeId: t.id })
			continue
		}
		const ancestorKeys = new Map<string, string>()
		for (const aid of ancestorIds(types, t.id))
			for (const f of map.get(aid)?.fields ?? []) ancestorKeys.set(f.key, aid)
		for (const f of t.fields) {
			const owner = ancestorKeys.get(f.key)
			if (owner)
				problems.push({
					code: 'key_collision',
					typeId: t.id,
					key: f.key,
					ancestorId: owner,
				})
		}
	}
	return problems
}

export type TreeNode<T> = T & { children: TreeNode<T>[]; depth: number }

/** Builds a sorted forest from flat rows (orphans become roots). */
export function buildTree<T extends { id: string; parentId: string | null; name: string }>(
	rows: readonly T[],
): TreeNode<T>[] {
	const nodes = new Map(rows.map((r) => [r.id, { ...r, children: [], depth: 0 } as TreeNode<T>]))
	const roots: TreeNode<T>[] = []
	for (const n of nodes.values()) {
		const parent = n.parentId ? nodes.get(n.parentId) : undefined
		if (parent && parent !== n) parent.children.push(n)
		else roots.push(n)
	}
	const sort = (list: TreeNode<T>[], depth: number, seen: Set<string>) => {
		list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
		for (const n of list) {
			if (seen.has(n.id)) continue
			seen.add(n.id)
			n.depth = depth
			sort(n.children, depth + 1, seen)
		}
	}
	sort(roots, 0, new Set())
	return roots
}

/** Depth-first flattening of a forest, e.g. for an indented <select>. */
export function flattenTree<T>(roots: readonly TreeNode<T>[]): TreeNode<T>[] {
	const out: TreeNode<T>[] = []
	const seen = new Set<TreeNode<T>>()
	const walk = (list: readonly TreeNode<T>[]) => {
		for (const n of list) {
			if (seen.has(n)) continue
			seen.add(n)
			out.push(n)
			walk(n.children)
		}
	}
	walk(roots)
	return out
}
