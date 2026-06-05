import {clsx, type ClassValue} from "clsx"
import {twMerge} from "tailwind-merge"

// cn merges conditional class names and de-duplicates conflicting Tailwind
// utilities. Used by all shadcn/ui components.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
