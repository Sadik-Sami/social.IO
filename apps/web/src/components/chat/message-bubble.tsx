"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, CheckCheck, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

import { Avatar, AvatarFallback, AvatarImage } from "@socialIO/ui/components/avatar";

import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useImageUploadStore } from "@/stores/image-upload-store";
import type { MessageResponse } from "@/types/api";
import { ChatImageViewer } from "./chat-image-viewer";

/**
 * Individual message bubble with sender info, status ticks, and entrance animation.
 * Sent messages: right-aligned, primary color.
 * Received messages: left-aligned, card surface with border.
 */
export function MessageBubble({
	message,
	conversationId,
	isOwn,
	showSenderName,
	senderAvatarUrl,
	onRetryImageSend,
}: {
	message: MessageResponse;
	conversationId: string;
	isOwn: boolean;
	showSenderName: boolean;
	senderAvatarUrl?: string | null;
	onRetryImageSend: (tempId: string) => void;
}) {
	const [isViewerOpen, setIsViewerOpen] = useState(false);
	const isOptimistic = message.id.startsWith("temp-");
	const isFailed = false;
	const pendingImageMessage = useImageUploadStore((s) => s.pendingImageMessages[message.id]);
	const uploadStatus = pendingImageMessage?.status;
	const uploadProgress = pendingImageMessage?.progress ?? 0;
	const isOptimisticImage = isOptimistic && message.type === "image";
	const canRetryImageSend = isOptimisticImage && uploadStatus === "failed";
	const hasImage = message.type === "image" && Boolean(message.imageUrl);
	const caption = useMemo(() => message.content?.trim() ?? "", [message.content]);
	const hasCaption = caption.length > 0;
	const imageSrc = message.imageUrl ?? "";
	const imageAlt = hasCaption
		? `Shared image from ${message.senderDisplayName ?? "user"}: ${caption}`
		: `Shared image from ${message.senderDisplayName ?? "user"}`;
	const shouldUseUnoptimized = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:");

	if (message.isDeleted) {
		return (
			<div className={`flex ${isOwn ? "justify-end" : "justify-start"} py-1`}>
				<div className="rounded-2xl bg-muted px-4 py-2">
					<p className="text-xs italic text-muted-foreground">This message was deleted</p>
				</div>
			</div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 10, scale: 0.95 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 400, damping: 25 }}
			className={`flex ${isOwn ? "justify-end" : "justify-start"} py-0.5`}
		>
			<div className={`flex max-w-[75%] items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
				{!isOwn && (
					<Avatar className="mb-5 size-7 shrink-0">
						<AvatarImage src={senderAvatarUrl ?? undefined} alt={message.senderDisplayName ?? "User"} />
						<AvatarFallback className="bg-secondary/15 text-secondary text-[10px] font-semibold">
							{(message.senderDisplayName ?? "U").substring(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				)}

				<div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
					{!isOwn && showSenderName && message.senderDisplayName && (
						<span className="mb-0.5 ml-1 text-[10px] font-semibold text-muted-foreground">
							{message.senderDisplayName}
						</span>
					)}

					<div
						className={`rounded-4xl ${
							hasImage ? "px-2.5 py-2" : "px-3.5 py-2"
						} ${
							isOwn
								? "rounded-br-sm bg-primary text-primary-foreground shadow-sm"
								: "rounded-bl-sm bg-card text-foreground ring-1 ring-border shadow-xs"
						} ${isOptimistic ? "opacity-70" : ""}`}
					>
						{hasImage ? (
							<div className="space-y-2">
								<div className="relative w-fit">
									<button
										type="button"
										onClick={() => setIsViewerOpen(true)}
										className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
										aria-label="Open image fullscreen"
									>
										<Image
											src={imageSrc}
											alt={imageAlt}
											width={240}
											height={240}
											sizes="(max-width: 768px) 70vw, 240px"
											unoptimized={shouldUseUnoptimized}
											className="h-auto max-w-60 rounded-lg object-cover"
										/>
									</button>

									{isOptimisticImage && uploadStatus && uploadStatus !== "failed" && (
										<div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35">
											<span className="rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">
												{uploadStatus === "uploading" ? `${uploadProgress}%` : "Sending..."}
											</span>
										</div>
									)}
									</div>

								{hasCaption && (
									<p className="px-1 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
										{caption}
									</p>
								)}
							</div>
						) : (
							<p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{message.content}</p>
						)}
					</div>

					<div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
						<span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>

						{message.isEdited && <span className="text-[10px] italic text-muted-foreground">edited</span>}

						{isOwn && !isOptimistic && !isFailed && (
							<StatusTick message={message} conversationId={conversationId} />
						)}

						{isOwn && isOptimistic && <Check className="h-3.5 w-3.5 text-primary-foreground/50" />}

						{isFailed && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}

						{canRetryImageSend && (
							<span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
								Failed
							</span>
						)}

						{canRetryImageSend && (
							<button
								type="button"
								onClick={() => onRetryImageSend(message.id)}
								className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10"
							>
								Retry
							</button>
						)}
					</div>
				</div>
			</div>

			{hasImage && (
				<ChatImageViewer
					open={isViewerOpen}
					onOpenChange={setIsViewerOpen}
					src={imageSrc}
					caption={caption}
					alt={imageAlt}
				/>
			)}
		</motion.div>
	);
}

function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	const h = d.getHours();
	const m = d.getMinutes().toString().padStart(2, "0");
	const ampm = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 || 12;
	return `${h12}:${m} ${ampm}`;
}

/**
 * Live status tick indicator for own confirmed messages.
 * Derives status dynamically from other participants' sequence progress.
 */
function StatusTick({ message, conversationId }: { message: MessageResponse; conversationId: string }) {
	const currentUserId = useAuthStore((s) => s.session?.user?.id);
	const progress = useChatStore((s) => s.participantProgress[conversationId]);

	const otherProgress = Object.entries(progress ?? {})
		.filter(([uid]) => uid !== currentUserId)
		.map(([, p]) => p);

	if (otherProgress.length === 0) {
		return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
	}

	const seenByAny = otherProgress.some((p) => p.lastSeenSequence >= message.sequenceNumber);
	if (seenByAny) {
		return <CheckCheck className="h-3.5 w-3.5 text-secondary" />;
	}

	const deliveredToAny = otherProgress.some((p) => p.lastDeliveredSequence >= message.sequenceNumber);
	if (deliveredToAny) {
		return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
	}

	return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
}
