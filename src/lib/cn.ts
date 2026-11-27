import { type ClassNameValue, twMerge } from 'tailwind-merge'

/** Merge class names (strings, arrays, falsy values are skipped); later Tailwind classes win. */
export function cn(...inputs: ClassNameValue[]) {
	return twMerge(...inputs)
}
