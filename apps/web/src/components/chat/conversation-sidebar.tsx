"use client";

import { useState, useMemo } from "react";
import { Search, MessageSquarePlus, LogOut, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

import { Skeleton } from "@socialIO/ui/components/skeleton";
import { Input } from "@socialIO/ui/components/input";
import { Avatar, AvatarFallback, AvatarImage } from "@socialIO/ui/components/avatar";
import { Badge } from "@socialIO/ui/components/badge";
import { Button } from "@socialIO/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@socialIO/ui/components/tooltip";

import { useChatStore } from "@/stores/chat-store";
import { useConversations } from "@/hooks/use-conversations";
import { useUnreadCounts } from "@/hooks/use-unread-counts";
import { useAuthStore } from "@/stores/auth-store";
import { useProfile } from "@/hooks/use-profile";
import { authClient } from "@/lib/auth-client";
import { NewChatFab } from "./new-chat-fab";
import { ProfileUpdateModal } from "./profile-update-modal";
import type { ConversationListItem } from "@/types/api";

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1_000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return "now";
	if (diffMin < 60) return `${diffMin}m`;
	if (diffHr < 24) return `${diffHr}h`;
	if (diffDay === 1) return "Yesterday";
	if (diffDay < 7) return `${diffDay}d`;

	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function getInitials(name: string): string {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

/**
 * Conversation sidebar — lists all conversations with last message preview,
 * timestamps, and unread badges. Supports search filtering and layout animations.
 */
export function ConversationSidebar() {
	const [searchFilter, setSearchFilter] = useState("");
	const activeConversationId = useChatStore((s) => s.activeConversationId);
	const setActiveConversation = useChatStore((s) => s.setActiveConversation);
	const currentUserId = useAuthStore((s) => s.session?.user?.id);

	const { data: conversations, isLoading } = useConversations();
	const { data: unreadCounts } = useUnreadCounts();

	const filtered = useMemo(() => {
		if (!conversations) return [];
		if (!searchFilter.trim()) return conversations;
		const q = searchFilter.toLowerCase();
		return conversations.filter((c) => {
			const name = getConversationName(c, currentUserId);
			return name.toLowerCase().includes(q);
		});
	}, [conversations, searchFilter, currentUserId]);

	return (
		<div className="flex h-full flex-col bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-4 py-7 bg-primary">
				<h1 className="text-xl font-bold tracking-tight text-white dark:text-foreground">
					Messages
				</h1>
			</div>

			{/* Search */}
			<div className="px-3 py-2">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						id="sidebar-search"
						type="text"
						placeholder="Search conversations..."
						value={searchFilter}
						onChange={(e) => setSearchFilter(e.target.value)}
						className="pl-8.5 h-9 rounded-xl border-border bg-muted/50 text-sm placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:bg-card"
					/>
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto">
				{isLoading ? (
					<SidebarSkeleton />
				) : filtered.length === 0 ? (
					<EmptySidebar hasConversations={!!conversations?.length} />
				) : (
					<AnimatePresence mode="popLayout">
						{filtered.map((conv) => (
							<ConversationItem
								key={conv.id}
								conversation={conv}
								isActive={conv.id === activeConversationId}
								unreadCount={unreadCounts?.[conv.id] ?? conv.unreadCount}
								currentUserId={currentUserId}
								onSelect={() => setActiveConversation(conv.id)}
							/>
						))}
					</AnimatePresence>
				)}
			</div>

			{/* FAB */}
			<NewChatFab />

			{/* Footer */}
			<SidebarFooter />
		</div>
	);
}

function getConversationName(
	conv: ConversationListItem,
	currentUserId: string | undefined,
): string {
	if (conv.type === "group" && conv.name) return conv.name;
	const other = conv.participants.find((p) => p.userId !== currentUserId);
	if (other?.displayName) return other.displayName;
	return conv.name ?? "Conversation";
}

function getConversationAvatar(
	conv: ConversationListItem,
	currentUserId: string | undefined,
): string | null {
	if (conv.avatarUrl) return conv.avatarUrl;
	if (conv.type === "dm") {
		const other = conv.participants.find((p) => p.userId !== currentUserId);
		return other?.avatarUrl ?? null;
	}
	return null;
}

function getLastMessagePreview(conv: ConversationListItem, currentUserId: string | undefined): string {
	if (!conv.lastMessage) return "No messages yet";
	
	if (conv.lastMessage.isDeleted) {
		const isOwn = conv.lastMessage.senderId === currentUserId;
		const name = conv.lastMessage.senderName?.split(" ")[0] ?? "User";
		return isOwn ? "You unsent a message" : `${name} unsent a message`;
	}

	if (conv.lastMessage.type === "image") return "Sent a photo";
	return conv.lastMessage.content ?? "";
}

function ConversationItem({
	conversation,
	isActive,
	unreadCount,
	currentUserId,
	onSelect,
}: {
	conversation: ConversationListItem;
	isActive: boolean;
	unreadCount: number;
	currentUserId: string | undefined;
	onSelect: () => void;
}) {
	const displayName = getConversationName(conversation, currentUserId);
	const avatarUrl = getConversationAvatar(conversation, currentUserId);
	const preview = getLastMessagePreview(conversation, currentUserId);
	const timestamp = conversation.lastMessage
		? formatRelativeTime(conversation.lastMessage.createdAt)
		: formatRelativeTime(conversation.createdAt);

	const isOwnLastMessage = conversation.lastMessage?.senderId === currentUserId;
	const isDeleted = conversation.lastMessage?.isDeleted ?? false;
	const senderPrefix = conversation.lastMessage && !isDeleted
		? isOwnLastMessage
			? "You"
			: (conversation.lastMessage.senderName?.split(" ")[0] ?? null)
		: null;

	const presenceMap = useChatStore((s) => s.presence);
	const otherMember = conversation.type !== "group"
		? conversation.participants?.find((m) => m.userId !== currentUserId)
		: null;
	
	const isOnline = otherMember 
		? presenceMap[otherMember.userId]?.online ?? otherMember.isOnline ?? false 
		: false;

	return (
		<motion.button
			layout
			layoutId={`conv-${conversation.id}`}
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -4 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			onClick={onSelect}
			className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-all duration-200 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
				isActive ? "bg-primary/8 dark:bg-primary/10 shadow-[inset_3px_0_0_0_var(--color-primary)]" : ""
			}`}
		>
			<div className="relative">
				<Avatar className="size-11 shrink-0">
					<AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
					<AvatarFallback className="bg-primary/12 text-primary text-xs font-semibold">
						{getInitials(displayName)}
					</AvatarFallback>
				</Avatar>
				{conversation.type !== "group" && isOnline && (
					<span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-green-500" />
				)}
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{/* Name + timestamp row */}
				<div className="flex items-center justify-between gap-2">
					<span className={`truncate text-sm text-foreground ${unreadCount > 0 ? "font-bold" : "font-medium"}`}>
						{displayName}
					</span>
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{timestamp}
					</span>
				</div>

				{/* Preview + unread badge row */}
				<div className="flex items-center justify-between gap-2">
					{/* min-w-0 ensures this flex child can shrink and truncate properly */}
					<div className="flex min-w-0 items-baseline gap-1">
						{senderPrefix && (
							<span className="shrink-0 text-xs font-medium text-muted-foreground">
								{senderPrefix}:
							</span>
						)}
						<span className={`truncate text-xs ${unreadCount > 0 ? "font-medium text-foreground/70" : "text-muted-foreground"}`}>
							{preview}
						</span>
					</div>
					{unreadCount > 0 && (
						<Badge className="h-5.5 min-w-5.5 shrink-0 rounded-full bg-destructive px-1.5 text-[11px] font-extrabold text-white shadow-sm hover:bg-destructive">
							{unreadCount > 99 ? "99+" : unreadCount}
						</Badge>
					)}
				</div>
			</div>
		</motion.button>
	);
}

function SidebarSkeleton() {
	return (
		<div className="space-y-1 p-2">
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-2 py-3">
					<Skeleton className="size-11 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-3.5 w-3/4 rounded" />
						<Skeleton className="h-3 w-1/2 rounded" />
					</div>
				</div>
			))}
		</div>
	);
}

function EmptySidebar({ hasConversations }: { hasConversations: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
				<MessageSquarePlus className="size-8 text-primary" />
			</div>
			<p className="text-sm font-medium text-foreground">
				{hasConversations ? "No matches found" : "It's quiet here"}
			</p>
			<p className="text-xs text-muted-foreground">
				{hasConversations
					? "Try a different search term"
					: "Start a debate? Hit the + button below"}
			</p>
		</div>
	);
}

function SidebarFooter() {
	const router = useRouter();
	const { theme, setTheme } = useTheme();
	const { data: profileData } = useProfile();
	const profile = profileData?.profile;

	const handleLogout = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: () => router.push("/"),
			},
		});
	};

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
	};

	return (
		<div className="flex items-center justify-between border-t border-primary-foreground/15 bg-primary px-3 py-3.5">
			{/* Left: Profile trigger */}
			<ProfileUpdateModal>
				<div className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10">
					<Avatar className="size-10 ring-2 ring-white/70">
						<AvatarImage src={profile?.avatarUrl ?? undefined} alt={profile?.displayName ?? "Profile"} />
						<AvatarFallback className="bg-white/15 text-xs font-semibold text-primary-foreground">
							{getInitials(profile?.displayName ?? "?")}
						</AvatarFallback>
					</Avatar>
					<span className="max-w-[100px] truncate text-xs font-medium text-primary-foreground">
						{profile?.displayName ?? "Profile"}
					</span>
				</div>
			</ProfileUpdateModal>

			{/* Right: Theme toggle + Logout */}
			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className="text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
								onClick={toggleTheme}
							/>
						}
					>
						<Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
						<Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
						<span className="sr-only">Toggle theme</span>
					</TooltipTrigger>
					<TooltipContent side="top">Toggle theme</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className="text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
								onClick={handleLogout}
							/>
						}
					>
						<LogOut className="size-4" />
						<span className="sr-only">Sign out</span>
					</TooltipTrigger>
					<TooltipContent side="top">Sign out</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

