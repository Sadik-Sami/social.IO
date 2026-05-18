"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogTrigger,
} from "@socialIO/ui/components/dialog";
import { Button } from "@socialIO/ui/components/button";
import { Input } from "@socialIO/ui/components/input";
import { Label } from "@socialIO/ui/components/label";
import { Avatar, AvatarFallback, AvatarImage } from "@socialIO/ui/components/avatar";

import { useProfile } from "@/hooks/use-profile";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useUpdateAvatar } from "@/hooks/use-update-avatar";
import { useUploadImage } from "@/hooks/use-upload-image";

const updateProfileSchema = z.object({
	displayName: z.string().min(2, "Name must be at least 2 characters"),
	bio: z.string().max(160, "Bio must be 160 characters or less").optional(),
});

type UpdateProfileValues = z.infer<typeof updateProfileSchema>;

function getInitials(name: string): string {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

export function ProfileUpdateModal({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: profileData } = useProfile();
	const profile = profileData?.profile;

	const { mutateAsync: updateProfile } = useUpdateProfile();
	const { mutateAsync: updateAvatar } = useUpdateAvatar();
	const { mutateAsync: uploadImage } = useUploadImage();

	const {
		register,
		handleSubmit,
		reset,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<UpdateProfileValues>({
		resolver: zodResolver(updateProfileSchema),
		defaultValues: {
			displayName: "",
			bio: "",
		},
	});

	const displayNameValue = watch("displayName");

	useEffect(() => {
		if (open && profile) {
			reset({
				displayName: profile.displayName ?? "",
				bio: profile.bio ?? "",
			});
			setAvatarPreview(null);
		}
	}, [open, profile, reset]);

	const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setAvatarPreview(URL.createObjectURL(file));
		setIsUploadingAvatar(true);

		try {
			const url = await uploadImage({ file });
			await updateAvatar({ avatarUrl: url });
			toast.success("Avatar updated!");
		} catch {
			setAvatarPreview(null);
			toast.error("Failed to upload avatar");
		} finally {
			setIsUploadingAvatar(false);
		}
	};

	const onSubmit = async (data: UpdateProfileValues) => {
		try {
			await updateProfile({
				displayName: data.displayName,
				bio: data.bio || undefined,
			});
			toast.success("Profile updated!");
			setOpen(false);
		} catch {
			toast.error("Failed to update profile");
		}
	};

	const currentAvatarUrl = avatarPreview ?? profile?.avatarUrl ?? null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<button type="button" />}>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-md rounded-2xl">
				<DialogHeader>
					<DialogTitle className="text-base">Edit Profile</DialogTitle>
					<DialogDescription>
						Update your display name, bio, and avatar.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 pt-2">
					{/* Avatar upload */}
					<div className="flex flex-col items-center gap-3">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="group relative flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-background transition-all hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-primary"
						>
							<Avatar className="size-20">
								<AvatarImage src={currentAvatarUrl ?? undefined} alt={displayNameValue} />
								<AvatarFallback className="bg-primary/12 text-primary text-lg font-semibold">
									{getInitials(displayNameValue || profile?.displayName || "")}
								</AvatarFallback>
							</Avatar>
							<div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
								{isUploadingAvatar ? (
									<Loader2 className="size-5 animate-spin text-white" />
								) : (
									<Camera className="size-5 text-white" />
								)}
							</div>
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleAvatarSelect}
						/>
						<p className="text-xs text-muted-foreground">
							Click to change your photo
						</p>
					</div>

					{/* Display Name */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="profile-displayName">Display Name</Label>
						<Input
							id="profile-displayName"
							placeholder="Your name"
							{...register("displayName")}
						/>
						{errors.displayName && (
							<p className="text-xs text-destructive">{errors.displayName.message}</p>
						)}
					</div>

					{/* Bio */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="profile-bio">Bio</Label>
						<textarea
							id="profile-bio"
							placeholder="A short bio about yourself"
							rows={3}
							className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
							{...register("bio")}
						/>
						{errors.bio && (
							<p className="text-xs text-destructive">{errors.bio.message}</p>
						)}
					</div>

					{/* Actions */}
					<div className="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="animate-spin" data-icon="inline-start" />
									Saving…
								</>
							) : (
								"Save Changes"
							)}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
