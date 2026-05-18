"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { motion } from "motion/react";

import { UserSearchModal } from "./user-search-modal";

/**
 * @description
 * Floating action button positioned at the bottom-right of the sidebar.
 * Opens the UserSearchModal to start a new conversation.
 */
export function NewChatFab() {
	const [isModalOpen, setIsModalOpen] = useState(false);

	return (
		<>
			<div className="relative px-4 py-3">
				<motion.button
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => setIsModalOpen(true)}
					className="ml-auto flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
					aria-label="New conversation"
				>
					<Plus className="h-5 w-5" />
				</motion.button>
			</div>

			<UserSearchModal open={isModalOpen} onOpenChange={setIsModalOpen} />
		</>
	);
}
