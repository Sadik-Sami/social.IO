"use client";

import { useState, useCallback } from "react";
import { Search, Loader2, X, Check } from "lucide-react";
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
import { Button } from "@socialIO/ui/components/button";

import { useSearchUsers } from "@/hooks/use-search-users";
import { useCreateConversation } from "@/hooks/use-create-conversation";
import { useChatStore } from "@/stores/chat-store";
import type { SearchResult } from "@/types/api";

export function CreateGroupModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [groupName, setGroupName] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
	const [selectedUsers, setSelectedUsers] = useState<SearchResult[]>([]);

	const { data: results, isLoading: isSearching } = useSearchUsers(debouncedQuery);
	const createConversation = useCreateConversation();
	const setActiveConversation = useChatStore((s) => s.setActiveConversation);

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

	const toggleUser = (user: SearchResult) => {
		setSelectedUsers((prev) => {
			const isSelected = prev.some((u) => u.id === user.id);
			if (isSelected) {
				return prev.filter((u) => u.id !== user.id);
			}
			return [...prev, user];
		});
	};

	const handleCreateGroup = async () => {
		if (groupName.trim() === "") {
			toast.error("Please enter a group name");
			return;
		}
		if (selectedUsers.length === 0) {
			toast.error("Please select at least one member");
			return;
		}

		try {
			const res = await createConversation.mutateAsync({
				type: "group",
				name: groupName.trim(),
				participantIds: selectedUsers.map((u) => u.id),
			});

			const newConvId = res.data?.conversation?.id as string | undefined;
			if (newConvId) {
				setActiveConversation(newConvId);
			}

			onOpenChange(false);
			resetState();
		} catch {
			toast.error("Failed to create group. Please try again.");
		}
	};

	const resetState = () => {
		setGroupName("");
		setSearchQuery("");
		setDebouncedQuery("");
		setSelectedUsers([]);
	};

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			onOpenChange(isOpen);
			if (!isOpen) {
				resetState();
			}
		},
		[onOpenChange],
	);

	const availableUsers = results?.filter((u) => !selectedUsers.some((selected) => selected.id === u.id)) ?? [];

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md rounded-2xl p-6">
				<DialogHeader>
					<DialogTitle>Create Group</DialogTitle>
					<DialogDescription>
						Name your group and select members to add.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<Input
						placeholder="Group Name"
						value={groupName}
						onChange={(e) => setGroupName(e.target.value)}
						className="border-border focus-visible:ring-primary"
					/>

					{/* Selected Users */}
					{selectedUsers.length > 0 && (
						<div className="flex flex-wrap gap-2 pt-2">
							{selectedUsers.map((user) => (
								<div
									key={user.id}
									className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium"
								>
									{user.displayName}
									<button
										onClick={() => toggleUser(user)}
										className="hover:text-primary/70 focus:outline-none"
									>
										<X className="h-3 w-3" />
									</button>
								</div>
							))}
						</div>
					)}

					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="text"
							placeholder="Search by name..."
							value={searchQuery}
							onChange={(e) => handleSearchChange(e.target.value)}
							className="pl-9 border-border focus-visible:ring-primary"
						/>
					</div>

					<div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/20">
						{isSearching && debouncedQuery.length >= 2 ? (
							<div className="flex items-center justify-center py-6">
								<Loader2 className="h-5 w-5 animate-spin text-primary" />
							</div>
						) : availableUsers.length > 0 ? (
							<div className="space-y-1 p-1">
								{availableUsers.map((user) => (
									<button
										key={user.id}
										onClick={() => toggleUser(user)}
										className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
									>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
												<AvatarFallback className="bg-secondary/15 text-secondary text-xs font-semibold">
													{user.displayName.substring(0, 2).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<span className="text-sm font-medium text-foreground">
												{user.displayName}
											</span>
										</div>
										<PlusIcon className="h-4 w-4 text-muted-foreground" />
									</button>
								))}
							</div>
						) : debouncedQuery.length >= 2 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No more users found.
							</p>
						) : (
							<p className="py-6 text-center text-sm text-muted-foreground">
								Search to add members
							</p>
						)}
					</div>

					<div className="flex justify-end pt-2">
						<Button
							onClick={handleCreateGroup}
							disabled={createConversation.isPending || groupName.trim() === "" || selectedUsers.length === 0}
							className="w-full sm:w-auto"
						>
							{createConversation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Create Group
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function PlusIcon(props: React.ComponentProps<"svg">) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M5 12h14" />
			<path d="M12 5v14" />
		</svg>
	);
}
