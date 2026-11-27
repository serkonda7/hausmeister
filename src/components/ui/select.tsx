import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import * as SelectPrimitive from '@kobalte/core/select'
import { type JSX, splitProps, type ValidComponent } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Kobalte select parts with app styling. Usage:
 *   <Select options={["a","b"]} itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}>
 *     <SelectTrigger aria-label="…"><SelectValue<string>>{(s) => s.selectedOption()}</SelectValue></SelectTrigger>
 *     <SelectContent />
 *   </Select>
 */
export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectHiddenSelect = SelectPrimitive.HiddenSelect

type TriggerProps<T extends ValidComponent = 'button'> = SelectPrimitive.SelectTriggerProps<T> & {
	class?: string
	children?: JSX.Element
}

export function SelectTrigger<T extends ValidComponent = 'button'>(
	props: PolymorphicProps<T, TriggerProps<T>>,
) {
	const [local, others] = splitProps(props as TriggerProps, ['class', 'children'])
	return (
		<SelectPrimitive.Trigger
			class={cn(
				'flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
				local.class,
			)}
			{...others}
		>
			{local.children}
			<SelectPrimitive.Icon class="ml-2 opacity-60" aria-hidden="true">
				▾
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	)
}

type ContentProps<T extends ValidComponent = 'div'> = SelectPrimitive.SelectContentProps<T> & {
	class?: string
}

export function SelectContent<T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, ContentProps<T>>,
) {
	const [local, others] = splitProps(props as ContentProps, ['class'])
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				class={cn(
					'hm-animate-fade relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
					local.class,
				)}
				{...others}
			>
				<SelectPrimitive.Listbox class="m-0 max-h-80 overflow-y-auto p-1" />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	)
}

type ItemProps<T extends ValidComponent = 'li'> = SelectPrimitive.SelectItemProps<T> & {
	class?: string
	children?: JSX.Element
}

export function SelectItem<T extends ValidComponent = 'li'>(
	props: PolymorphicProps<T, ItemProps<T>>,
) {
	const [local, others] = splitProps(props as ItemProps, ['class', 'children'])
	return (
		<SelectPrimitive.Item
			class={cn(
				'relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-2 pr-8 text-base outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
				local.class,
			)}
			{...others}
		>
			<SelectPrimitive.ItemIndicator class="absolute right-2 flex size-4 items-center justify-center">
				✓
			</SelectPrimitive.ItemIndicator>
			<SelectPrimitive.ItemLabel>{local.children}</SelectPrimitive.ItemLabel>
		</SelectPrimitive.Item>
	)
}
