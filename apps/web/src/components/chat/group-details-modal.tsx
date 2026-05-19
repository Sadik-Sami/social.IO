"use client";

import { useState } from "react";
import { UserPlus, MoreVertical, X, Shield, ShieldAlert, Edit2 } from "lucide-react";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@socialIO/ui/components/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@socialIO/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@socialIO/ui/components/dropdown-menu";
import { Button } from "@socialIO/ui/components/button";
import { ScrollArea } from "@socialIO/ui/components/scroll-area";
import { Input } from "@socialIO/ui/components/input";

import { useConversationDetail } from "@/hooks/use-conversation-detail";
import { useAuthStore } from "@/stores/auth-store";
import { useRemoveGroupMember } from "@/hooks/use-remove-group-member";
import { useUpdateMemberNickname } from "@/hooks/use-update-member-nickname";
import { AddGroupMemberModal } from "./add-group-member-modal";

export function GroupDetailsModal({
	conversationId,
	open,
	onOpenChange,
}: {
	conversationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const currentUserId = useAuthStore((s) => s.session?.user?.id);
	const { data: detail } = useConversationDetail(conversationId);
	const removeMember = useRemoveGroupMember();
	const updateNickname = useUpdateMemberNickname();

	const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
	const [editingNickname, setEditingNickname] = useState(false);
	const [nicknameInput, setNicknameInput] = useState("");

	if (!detail || detail.type !== "group") return null;

	const currentParticipant = detail.participants.find((p) => p.userId === currentUserId);
	const isAdmin = currentParticipant?.role === "admin";

	const handleRemoveMember = async (userId: string) => {
		try {
			await removeMember.mutateAsync({ conversationId, userId });
			toast.success("Member removed");
		} catch {
			toast.error("Failed to remove member");
		}
	};

	const handleSaveNickname = async () => {
		try {
			await updateNickname.mutateAsync({
				conversationId,
				nickname: nicknameInput.trim() === "" ? null : nicknameInput.trim(),
			});
			setEditingNickname(false);
			toast.success("Nickname updated");
		} catch {
			toast.error("Failed to update nickname");
		}
	};

	const startEditingNickname = () => {
		setNicknameInput(currentParticipant?.nickname || currentParticipant?.displayName || "");
		setEditingNickname(true);
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
					<div className="bg-muted/30 px-6 py-8 flex flex-col items-center justify-center border-b border-border">
						<Avatar className="h-20 w-20 shadow-md mb-4 border-4 border-background">
							<AvatarImage src={detail.avatarUrl ?? undefined} alt={detail.name ?? "Group"} />
							<AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
								{(detail.name ?? "G").substring(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<h2 className="text-xl font-bold text-foreground">{detail.name}</h2>
						<p className="text-sm text-muted-foreground mt-1">
							{detail.participants.length} members
						</p>
					</div>

					<div className="px-6 py-4 flex items-center justify-between">
						<h3 className="font-semibold text-sm text-foreground">Members</h3>
						{isAdmin && (
							<Button
								variant="ghost"
								size="sm"
								className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
								onClick={() => setIsAddMemberOpen(true)}
							>
								<UserPlus className="h-4 w-4" />
								<span>Add</span>
							</Button>
						)}
					</div>

					<ScrollArea className="max-h-[300px] px-2 pb-4">
						<div className="space-y-1 px-4">
							{detail.participants.map((p) => {
								const isMe = p.userId === currentUserId;
								const displayName = p.nickname || p.displayName || "Unknown";

								return (
									<div
										key={p.id}
										className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
									>
										<div className="flex items-center gap-3 overflow-hidden">
											<Avatar className="h-10 w-10 shrink-0">
												<AvatarImage src={p.avatarUrl ?? undefined} alt={displayName} />
												<AvatarFallback className="bg-secondary/15 text-secondary text-xs font-semibold">
													{displayName.substring(0, 2).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col overflow-hidden">
												<div className="flex items-center gap-1.5">
													<span className="text-sm font-semibold truncate text-foreground">
														{displayName}
													</span>
													{p.role === "admin" && (
														<Shield className="h-3.5 w-3.5 text-primary shrink-0" />
													)}
												</div>
												{p.nickname && (
													<span className="text-xs text-muted-foreground truncate">
														~{p.displayName}
													</span>
												)}
											</div>
										</div>

										<div className="flex items-center gap-2">
											{isMe && p.role === "admin" && (
												<span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
													Admin
												</span>
											)}

											{isMe ? (
												editingNickname ? (
													<div className="flex items-center gap-1">
														<Input
															value={nicknameInput}
															onChange={(e) => setNicknameInput(e.target.value)}
															className="h-8 w-24 text-xs"
															placeholder="Nickname"
															autoFocus
															onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
														/>
														<Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={handleSaveNickname}>
															<CheckIcon className="h-4 w-4" />
														</Button>
														<Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingNickname(false)}>
															<X className="h-4 w-4" />
														</Button>
													</div>
												) : (
													<Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" onClick={startEditingNickname}>
														<Edit2 className="h-4 w-4" />
													</Button>
												)
											) : (
												isAdmin && (
													<DropdownMenu>
														<DropdownMenuTrigger className="flex items-center justify-center h-8 w-8 text-muted-foreground hover:bg-muted rounded-md focus:outline-none">
															<MoreVertical className="h-4 w-4" />
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-40">
															<DropdownMenuItem
																className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
																onClick={() => handleRemoveMember(p.userId)}
															>
																<ShieldAlert className="h-4 w-4 mr-2" />
																Remove from group
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												)
											)}
										</div>
									</div>
								);
							})}
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>

			{isAddMemberOpen && (
				<AddGroupMemberModal
					conversationId={conversationId}
					open={isAddMemberOpen}
					onOpenChange={setIsAddMemberOpen}
				/>
			)}
		</>
	);
}

function CheckIcon(props: React.ComponentProps<"svg">) {
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
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}
