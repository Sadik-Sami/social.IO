"use client";

import { useState } from "react";
import { Plus, User, Users } from "lucide-react";
import { motion } from "motion/react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@socialIO/ui/components/dropdown-menu";
import { UserSearchModal } from "./user-search-modal";
import { CreateGroupModal } from "./create-group-modal";

/**
 * @description
 * Floating action button positioned at the bottom-right of the sidebar.
 * Opens the DropdownMenu to start a new DM or Group.
 */
export function NewChatFab() {
	const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
	const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

	return (
		<>
			<div className="relative px-4 py-3">
				<DropdownMenu>
					<DropdownMenuTrigger className="ml-auto flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
						<Plus className="h-5 w-5" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={8} className="w-48 rounded-xl p-1">
						<DropdownMenuItem
							onClick={() => setIsUserSearchOpen(true)}
							className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium"
						>
							<User className="mr-2 h-4 w-4" />
							New Direct Message
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setIsCreateGroupOpen(true)}
							className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium"
						>
							<Users className="mr-2 h-4 w-4" />
							New Group Chat
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<UserSearchModal open={isUserSearchOpen} onOpenChange={setIsUserSearchOpen} />
			<CreateGroupModal open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} />
		</>
	);
}
