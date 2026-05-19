"use client";

import Image from "next/image";
import { ArrowLeft, Download } from "lucide-react";

import { Dialog, DialogContent } from "@socialIO/ui/components/dialog";

function isBlobLikeUrl(src: string): boolean {
	return src.startsWith("blob:") || src.startsWith("data:");
}

function getDownloadName(src: string): string {
	if (isBlobLikeUrl(src)) return "chat-image";
	try {
		const url = new URL(src);
		const lastSegment = url.pathname.split("/").pop();
		return lastSegment || "chat-image";
	} catch {
		return "chat-image";
	}
}

async function triggerDownload(src: string): Promise<void> {
	const fileName = getDownloadName(src);
	try {
		const response = await fetch(src);
		if (!response.ok) throw new Error("download failed");
		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = fileName;
		anchor.click();
		URL.revokeObjectURL(objectUrl);
		return;
	} catch {
		const anchor = document.createElement("a");
		anchor.href = src;
		anchor.download = fileName;
		anchor.target = "_blank";
		anchor.rel = "noopener noreferrer";
		anchor.click();
	}
}

export function ChatImageViewer({
	open,
	onOpenChange,
	src,
	caption,
	alt,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	src: string;
	caption?: string | null;
	alt: string;
}) {
	const unoptimized = isBlobLikeUrl(src);
	const trimmedCaption = caption?.trim() ?? "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="inset-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-none bg-black p-0 text-white ring-0 sm:max-w-none"
			>
				<div className="flex h-full flex-col">
					<div className="flex items-center justify-between px-3 py-2 sm:px-4">
						<button
							type="button"
							aria-label="Back"
							onClick={() => onOpenChange(false)}
							className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
						>
							<ArrowLeft className="h-4 w-4" />
							Back
						</button>

						<button
							type="button"
							aria-label="Download image"
							onClick={() => {
								void triggerDownload(src);
							}}
							className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
						>
							<Download className="h-4 w-4" />
							Download
						</button>
					</div>

					<div className="relative min-h-0 flex-1">
						<Image
							src={src}
							alt={alt}
							fill
							sizes="100vw"
							unoptimized={unoptimized}
							className="object-contain"
							priority
						/>
					</div>

					{trimmedCaption.length > 0 && (
						<div className="mx-auto w-full max-w-3xl px-4 py-3 text-center text-sm text-white/90">
							{trimmedCaption}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
