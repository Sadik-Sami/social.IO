"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ImagePlus, Loader2, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { useSendMessage } from "@/hooks/use-send-message";
import { useImageMessageFlow } from "@/hooks/use-image-message-flow";
import { useChatStore } from "@/stores/chat-store";
import { useWS } from "@/components/providers/ws-provider";

/**
 * Message composer — auto-growing textarea, draft persistence,
 * debounced typing detection, and send on Enter.
 * Styled as a floating pill above the bottom edge — no harsh border.
 */
export function Composer({ conversationId }: { conversationId: string }) {
	const { send } = useWS();
	const sendMessage = useSendMessage();
	const { startImageMessageSend, isImageMessageFlowPending } = useImageMessageFlow();
	const draft = useChatStore((s) => s.drafts[conversationId] ?? "");
	const setDraft = useChatStore((s) => s.setDraft);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isTypingRef = useRef(false);
	const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
	const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);

	const content = draft;

	const autoResize = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		const maxHeight = 5 * 24;
		textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
	}, []);

	const emitTypingStart = useCallback(() => {
		if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
		typingTimerRef.current = setTimeout(() => {
			if (!isTypingRef.current) {
				isTypingRef.current = true;
				send({ type: "typing_start", payload: { conversationId } });
			}
		}, 300);
	}, [conversationId, send]);

	const emitTypingStop = useCallback(() => {
		if (typingTimerRef.current) {
			clearTimeout(typingTimerRef.current);
			typingTimerRef.current = null;
		}
		if (isTypingRef.current) {
			isTypingRef.current = false;
			send({ type: "typing_stop", payload: { conversationId } });
		}
	}, [conversationId, send]);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setDraft(conversationId, e.target.value);
			autoResize();
			if (e.target.value.trim()) {
				emitTypingStart();
			} else {
				emitTypingStop();
			}
		},
		[conversationId, setDraft, autoResize, emitTypingStart, emitTypingStop],
	);

	const clearSelectedImage = useCallback(() => {
		if (selectedImagePreviewUrl) {
			URL.revokeObjectURL(selectedImagePreviewUrl);
		}
		setSelectedImageFile(null);
		setSelectedImagePreviewUrl(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}, [selectedImagePreviewUrl]);

	const handleSend = useCallback(() => {
		void (async () => {
			const trimmed = content.trim();
			if (!trimmed && !selectedImageFile) return;
			if (sendMessage.isPending || isImageMessageFlowPending) return;

			try {
				if (selectedImageFile) {
					startImageMessageSend({ conversationId, file: selectedImageFile, content: trimmed });
				} else {
					await sendMessage.mutateAsync({
						conversationId,
						content: trimmed,
						type: "text",
						imageUrl: null,
					});
				}

				setDraft(conversationId, "");
				clearSelectedImage();
				emitTypingStop();

				if (textareaRef.current) {
					textareaRef.current.style.height = "auto";
				}
				requestAnimationFrame(() => {
					textareaRef.current?.focus();
				});
			} catch {
				toast.error("Failed to send message");
			}
		})();
	}, [
		content,
		conversationId,
		sendMessage,
		isImageMessageFlowPending,
		startImageMessageSend,
		setDraft,
		emitTypingStop,
		selectedImageFile,
		clearSelectedImage,
	]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const handleBlur = useCallback(() => emitTypingStop(), [emitTypingStop]);

	const handleOpenImagePicker = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleImageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error("Please choose an image file");
			event.target.value = "";
			return;
		}

		setSelectedImageFile(file);
		setSelectedImagePreviewUrl((prevUrl) => {
			if (prevUrl) {
				URL.revokeObjectURL(prevUrl);
			}
			return URL.createObjectURL(file);
		});
	}, []);

	useEffect(() => {
		return () => {
			if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
			if (selectedImagePreviewUrl) {
				URL.revokeObjectURL(selectedImagePreviewUrl);
			}
		};
	}, [selectedImagePreviewUrl]);

	useEffect(() => {
		autoResize();
	}, [conversationId, autoResize]);

	const canSend = (!!content.trim() || !!selectedImageFile) && !sendMessage.isPending && !isImageMessageFlowPending;

	return (
		<div className="shrink-0 px-4 py-3 bg-background">
			{selectedImagePreviewUrl && (
				<div className="mb-2 flex w-fit items-start gap-2 rounded-xl bg-muted/70 p-2 ring-1 ring-border/50">
					<img
						src={selectedImagePreviewUrl}
						alt="Selected image preview"
						className="h-20 w-20 rounded-lg object-cover"
					/>
					<button
						type="button"
						onClick={clearSelectedImage}
						className="mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
						aria-label="Remove selected image"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			)}

			{/* Pill container — subtle surface, no hard top border */}
			<div className="flex items-end gap-2 rounded-[20px] bg-muted/70 px-4 py-2.5 ring-1 ring-border/50 shadow-(--shadow-soft) transition-shadow duration-200 focus-within:ring-primary/40 focus-within:ring-2">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={handleImageChange}
					className="hidden"
				/>
				<button
					type="button"
					onClick={handleOpenImagePicker}
					disabled={isImageMessageFlowPending || sendMessage.isPending}
					aria-label="Attach image"
					className="mb-0.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
				>
					{isImageMessageFlowPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
				</button>

				<textarea
					ref={textareaRef}
					id="message-composer"
					value={content}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					placeholder="Type a message…"
					rows={1}
					className="flex-1 resize-none bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
				/>

				<button
					onClick={handleSend}
					disabled={!canSend}
					type="button"
					aria-label="Send message"
					className="mb-0.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
				>
					<SendHorizontal className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
