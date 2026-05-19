"use client";

import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@socialIO/ui/components/dialog";
import { Input } from "@socialIO/ui/components/input";
import { Avatar, AvatarFallback, AvatarImage } from "@socialIO/ui/components/avatar";

import { useSearchUsers } from "@/hooks/use-search-users";
import { useAddGroupMember } from "@/hooks/use-add-group-member";
import { useConversationDetail } from "@/hooks/use-conversation-detail";
import type { SearchResult } from "@/types/api";

export function AddGroupMemberModal({
	conversationId,
	open,
	onOpenChange,
}: {
	conversationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

	const { data: results, isLoading: isSearching } = useSearchUsers(debouncedQuery);
	const { data: detail } = useConversationDetail(conversationId);
	const addMember = useAddGroupMember();

	const handleSearchChange = useCallback(
		(value: string) => {
			setSearchQuery(value);

			if (debounceTimer) clearTimeout(debounceTimer);

			const timer = setTimeout(() => {
				setDebouncedQuery(value);
			}, 300);
			setDebounceTimer(timer);
		},
		[debounceTimer],
	);

	const handleAddUser = useCallback(
		async (user: SearchResult) => {
			try {
				await addMember.mutateAsync({
					conversationId,
					participantId: user.id,
					role: "member",
				});

				toast.success("Member added");
				onOpenChange(false);
				setSearchQuery("");
				setDebouncedQuery("");
			} catch {
				toast.error("Failed to add member");
			}
		},
		[addMember, conversationId, onOpenChange],
	);

	// Filter out users already in the group
	const existingUserIds = new Set(detail?.participants.map((p) => p.userId));
	const availableUsers = results?.filter((u) => !existingUserIds.has(u.id)) ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md rounded-2xl">
				<DialogHeader>
					<DialogTitle>Add Member</DialogTitle>
					<DialogDescription>Search for users to add to the group.</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="text"
							placeholder="Search by name..."
							value={searchQuery}
							onChange={(e) => handleSearchChange(e.target.value)}
							className="pl-9"
							autoFocus
						/>
					</div>

					<div className="max-h-64 overflow-y-auto">
						{isSearching && debouncedQuery.length >= 2 ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-5 w-5 animate-spin text-primary" />
							</div>
						) : availableUsers.length > 0 ? (
							<div className="space-y-1">
								{availableUsers.map((user) => (
									<button
										key={user.id}
										onClick={() => handleAddUser(user)}
										disabled={addMember.isPending}
										className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
									>
										<Avatar className="h-9 w-9">
											<AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
											<AvatarFallback className="bg-secondary/15 text-secondary text-xs font-semibold">
												{user.displayName.substring(0, 2).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="text-sm font-semibold text-foreground">
											{user.displayName}
										</span>
									</button>
								))}
							</div>
						) : debouncedQuery.length >= 2 ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								No users found to add.
							</p>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">
								Type at least 2 characters to search
							</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
