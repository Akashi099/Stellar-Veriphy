"use client";

import { FiCheck,FiCopy } from "react-icons/fi";

import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/utils/cn";

interface CopyButtonProps {
    /** Text copied to the clipboard when the button is clicked. */
    text: string;
    className?: string;
    /** Accessible label for the button. Defaults to "Copy to clipboard". */
    label?: string;
}

/**
 * Small icon button that copies `text` to the clipboard, swapping to a
 * checkmark briefly to confirm the copy succeeded.
 */
export function CopyButton({ text, className, label = "Copy to clipboard" }: CopyButtonProps) {
    const { copy, isCopied } = useCopyToClipboard();

    return (
        <button
            type="button"
            onClick={() => copy(text)}
            aria-label={isCopied ? "Copied" : label}
            title={label}
            className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md p-1.5 transition-colors",
                "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
                "dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                className
            )}
        >
            {isCopied ? (
                <>
                    <FiCheck className="w-4 h-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Copied</span>
                </>
            ) : (
                <FiCopy className="w-4 h-4" aria-hidden="true" />
            )}
        </button>
    );
}
