"use client";

import { Loader2, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useChatStore } from "@/stores/chat-store";

/**
 * @description
 * Connection banner — thin bar at top of chat area showing WS connection status.
 * Visible when status is 'connecting' or 'closed', hidden when 'open'.
 * Uses glassmorphism per design system.
 */
export function ConnectionBanner() {
	const wsStatus = useChatStore((s) => s.wsStatus);

	return (
		<AnimatePresence>
			{wsStatus !== "open" && (
				<motion.div
					key="connection-banner"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.2 }}
					className="shrink-0 overflow-hidden"
				>
					<div
						className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium backdrop-blur-md ${
							wsStatus === "connecting"
								? "bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
								: "bg-destructive/15 text-destructive dark:bg-destructive/10"
						}`}
					>
						{wsStatus === "connecting" ? (
							<>
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>Reconnecting...</span>
							</>
						) : (
							<>
								<WifiOff className="h-3 w-3" />
								<span>Connection lost. Retrying...</span>
							</>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
