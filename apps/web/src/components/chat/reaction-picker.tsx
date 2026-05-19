import { SmilePlus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@socialIO/ui/components/dropdown-menu";
import { Button } from "@socialIO/ui/components/button";

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👀"];

export function ReactionPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-100 md:opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer">
				<SmilePlus className="h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="center" className="w-fit p-2 rounded-2xl flex flex-wrap gap-1 max-w-[160px]">
				{COMMON_EMOJIS.map((emoji) => (
					<button
						key={emoji}
						onClick={() => onSelect(emoji)}
						className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted focus:outline-none focus:bg-muted transition-colors text-lg cursor-pointer"
					>
						{emoji}
					</button>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
